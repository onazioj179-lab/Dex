/**
 * DEX Layout Components
 * Responsive layout utilities
 */

import React from 'react';

// ==================== TYPES ====================

interface ContainerProps {
  children: React.ReactNode;
  maxWidth?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'full';
  padding?: number;
  centered?: boolean;
}

interface StackProps {
  children: React.ReactNode;
  direction?: 'row' | 'column';
  gap?: number;
  align?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justify?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
  wrap?: boolean;
}

interface BoxProps {
  children: React.ReactNode;
  padding?: number | string;
  margin?: number | string;
  background?: string;
  border?: string;
  borderRadius?: number;
  shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  overflow?: 'visible' | 'hidden' | 'auto' | 'scroll';
}

interface FlexProps {
  children: React.ReactNode;
  direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse';
  wrap?: boolean | 'reverse';
  gap?: number;
  alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline';
  justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
}

interface GridProps {
  children: React.ReactNode;
  columns?: number | string;
  rows?: number | string;
  gap?: number;
  columnGap?: number;
  rowGap?: number;
  minChildWidth?: number;
}

interface CenterProps {
  children: React.ReactNode;
  inline?: boolean;
}

interface AspectRatioProps {
  children: React.ReactNode;
  ratio?: number;
}

// ==================== CONTAINER ====================

export const Container: React.FC<ContainerProps> = ({
  children,
  maxWidth = 'lg',
  padding = 24,
  centered = true,
}) => {
  const maxWidths = {
    xs: 480,
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
    full: '100%',
  };

  const styles: React.CSSProperties = {
    width: '100%',
    maxWidth: maxWidths[maxWidth],
    padding: `0 ${padding}px`,
    margin: centered ? '0 auto' : undefined,
    boxSizing: 'border-box',
  };

  return <div style={styles}>{children}</div>;
};

// ==================== STACK ====================

export const Stack: React.FC<StackProps> = ({
  children,
  direction = 'column',
  gap = 16,
  align = 'stretch',
  justify = 'start',
  wrap = false,
}) => {
  const alignMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };

  const justifyMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    gap,
    alignItems: alignMap[align],
    justifyContent: justifyMap[justify],
    flexWrap: wrap ? 'wrap' : 'nowrap',
  };

  return <div style={styles}>{children}</div>;
};

// ==================== BOX ====================

export const Box: React.FC<BoxProps> = ({
  children,
  padding,
  margin,
  background,
  border,
  borderRadius,
  shadow = 'none',
  overflow = 'visible',
}) => {
  const shadows = {
    none: 'none',
    sm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px rgba(0, 0, 0, 0.1)',
    lg: '0 10px 15px rgba(0, 0, 0, 0.1)',
    xl: '0 20px 25px rgba(0, 0, 0, 0.15)',
  };

  const styles: React.CSSProperties = {
    padding,
    margin,
    background,
    border,
    borderRadius,
    boxShadow: shadows[shadow],
    overflow,
    boxSizing: 'border-box',
  };

  return <div style={styles}>{children}</div>;
};

// ==================== FLEX ====================

export const Flex: React.FC<FlexProps> = ({
  children,
  direction = 'row',
  wrap = false,
  gap,
  alignItems = 'stretch',
  justifyContent = 'start',
}) => {
  const alignMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    stretch: 'stretch',
    baseline: 'baseline',
  };

  const justifyMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    flexDirection: direction,
    flexWrap: wrap === true ? 'wrap' : wrap === 'reverse' ? 'wrap-reverse' : 'nowrap',
    gap,
    alignItems: alignMap[alignItems],
    justifyContent: justifyMap[justifyContent],
  };

  return <div style={styles}>{children}</div>;
};

// ==================== GRID ====================

export const Grid: React.FC<GridProps> = ({
  children,
  columns = 12,
  rows,
  gap = 16,
  columnGap,
  rowGap,
  minChildWidth,
}) => {
  const getGridColumns = () => {
    if (minChildWidth) {
      return `repeat(auto-fit, minmax(${minChildWidth}px, 1fr))`;
    }
    if (typeof columns === 'number') {
      return `repeat(${columns}, 1fr)`;
    }
    return columns;
  };

  const styles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: getGridColumns(),
    gridTemplateRows: typeof rows === 'number' ? `repeat(${rows}, 1fr)` : rows,
    gap,
    columnGap,
    rowGap,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== CENTER ====================

export const Center: React.FC<CenterProps> = ({
  children,
  inline = false,
}) => {
  const styles: React.CSSProperties = {
    display: inline ? 'inline-flex' : 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  return <div style={styles}>{children}</div>;
};

// ==================== ASPECT RATIO ====================

export const AspectRatio: React.FC<AspectRatioProps> = ({
  children,
  ratio = 16 / 9,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      width: '100%',
      paddingBottom: `${(1 / ratio) * 100}%`,
    },
    content: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    },
  };

  return (
    <div style={styles.container as any}>
      <div style={styles.content as any}>{children}</div>
    </div>
  );
};

// ==================== SPACER ====================

interface SpacerProps {
  size?: number;
  flex?: number | string;
}

export const Spacer: React.FC<SpacerProps> = ({
  size,
  flex = 1,
}) => {
  const styles: React.CSSProperties = size
    ? { width: size, height: size, flexShrink: 0 }
    : { flex };

  return <div style={styles} />;
};

// ==================== DIVIDER ====================

interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  spacing?: number;
}

export const Divider: React.FC<DividerProps> = ({
  orientation = 'horizontal',
  spacing = 16,
}) => {
  const styles: React.CSSProperties = orientation === 'horizontal'
    ? {
      width: '100%',
      height: 1,
      background: 'var(--color-border)',
      margin: `${spacing}px 0`,
    }
    : {
      width: 1,
      height: '100%',
      background: 'var(--color-border)',
      margin: `0 ${spacing}px`,
    };

  return <div style={styles} />;
};

// ==================== WRAP ====================

interface WrapProps {
  children: React.ReactNode;
  gap?: number;
  align?: 'start' | 'center' | 'end';
}

export const Wrap: React.FC<WrapProps> = ({
  children,
  gap = 12,
  align = 'start',
}) => {
  const alignMap = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
  };

  const styles: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    gap,
    alignItems: alignMap[align],
  };

  return <div style={styles}>{children}</div>;
};

// ==================== SIMPLE GRID ====================

interface SimpleGridProps {
  children: React.ReactNode;
  columns?: number;
  spacing?: number;
  minChildWidth?: number;
}

export const SimpleGrid: React.FC<SimpleGridProps> = ({
  children,
  columns = 2,
  spacing = 16,
  minChildWidth,
}) => {
  const styles: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: minChildWidth
      ? `repeat(auto-fit, minmax(${minChildWidth}px, 1fr))`
      : `repeat(${columns}, 1fr)`,
    gap: spacing,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== SECTION ====================

interface SectionProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  padding?: number;
}

export const Section: React.FC<SectionProps> = ({
  children,
  title,
  subtitle,
  action,
  padding = 24,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    section: {
      padding,
    },
    header: {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 24,
    },
    titleWrapper: {
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
    },
    title: {
      fontSize: 20,
      fontWeight: 600,
      color: 'var(--color-text)',
      margin: 0,
    },
    subtitle: {
      fontSize: 14,
      color: 'var(--color-text-muted)',
      margin: 0,
    },
  };

  return (
    <section style={styles.section}>
      {(title || action) && (
        <header style={styles.header}>
          <div style={styles.titleWrapper as any}>
            {title && <h2 style={styles.title}>{title}</h2>}
            {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
};

// ==================== HIDE/SHOW ====================

interface VisibilityProps {
  children: React.ReactNode;
  when: boolean;
  fallback?: React.ReactNode;
}

export const Show: React.FC<VisibilityProps> = ({
  children,
  when,
  fallback = null,
}) => {
  return when ? <>{children}</> : <>{fallback}</>;
};

export const Hide: React.FC<VisibilityProps> = ({
  children,
  when,
  fallback = null,
}) => {
  return when ? <>{fallback}</> : <>{children}</>;
};

// ==================== STICKY ====================

interface StickyProps {
  children: React.ReactNode;
  top?: number;
  bottom?: number;
  zIndex?: number;
}

export const Sticky: React.FC<StickyProps> = ({
  children,
  top,
  bottom,
  zIndex = 100,
}) => {
  const styles: React.CSSProperties = {
    position: 'sticky',
    top,
    bottom,
    zIndex,
  };

  return <div style={styles}>{children}</div>;
};

// ==================== OVERLAY ====================

interface OverlayProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose?: () => void;
  blur?: boolean;
}

export const Overlay: React.FC<OverlayProps> = ({
  children,
  isOpen,
  onClose,
  blur = false,
}) => {
  if (!isOpen) return null;

  const styles: Record<string, React.CSSProperties> = {
    overlay: {
      position: 'fixed',
      inset: 0,
      background: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: blur ? 'blur(4px)' : undefined,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
    },
    content: {
      position: 'relative',
      zIndex: 1001,
    },
  };

  return (
    <div style={styles.overlay as any} onClick={onClose}>
      <div style={styles.content as any} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
};

// ==================== ABSOLUTE CENTER ====================

interface AbsoluteCenterProps {
  children: React.ReactNode;
  axis?: 'both' | 'horizontal' | 'vertical';
}

export const AbsoluteCenter: React.FC<AbsoluteCenterProps> = ({
  children,
  axis = 'both',
}) => {
  const getTransform = () => {
    switch (axis) {
      case 'horizontal':
        return 'translateX(-50%)';
      case 'vertical':
        return 'translateY(-50%)';
      default:
        return 'translate(-50%, -50%)';
    }
  };

  const styles: React.CSSProperties = {
    position: 'absolute',
    top: axis === 'horizontal' ? undefined : '50%',
    left: axis === 'vertical' ? undefined : '50%',
    transform: getTransform(),
  };

  return <div style={styles}>{children}</div>;
};

export default Container;
