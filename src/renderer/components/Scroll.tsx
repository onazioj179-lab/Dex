/**
 * DEX Scroll Components
 * Scroll-related utilities and components
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';

// ==================== TYPES ====================

interface ScrollAreaProps {
  children: React.ReactNode;
  maxHeight?: number | string;
  showScrollbar?: 'always' | 'hover' | 'never';
  scrollbarWidth?: number;
  onScroll?: (e: React.UIEvent<HTMLDivElement>) => void;
}

interface ScrollToTopProps {
  threshold?: number;
  smooth?: boolean;
  position?: 'bottom-right' | 'bottom-left' | 'bottom-center';
  offset?: number;
}

interface ScrollProgressProps {
  position?: 'top' | 'bottom';
  height?: number;
  color?: string;
}

interface ScrollSpyProps {
  sections: { id: string; label: string }[];
  offset?: number;
  activeClass?: string;
  onSectionChange?: (sectionId: string) => void;
  children: React.ReactNode;
}

interface ParallaxScrollProps {
  children: React.ReactNode;
  speed?: number;
  direction?: 'up' | 'down';
}

// ==================== SCROLL AREA ====================

export const ScrollArea: React.FC<ScrollAreaProps> = ({
  children,
  maxHeight = 400,
  showScrollbar = 'hover',
  scrollbarWidth = 8,
  onScroll,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [scrollRatio, setScrollRatio] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updateThumb = () => {
      if (!containerRef.current || !contentRef.current) return;

      const containerHeight = containerRef.current.clientHeight;
      const contentHeight = contentRef.current.scrollHeight;

      if (contentHeight > containerHeight) {
        setThumbHeight((containerHeight / contentHeight) * containerHeight);
      } else {
        setThumbHeight(0);
      }
    };

    updateThumb();
    window.addEventListener('resize', updateThumb);
    return () => window.removeEventListener('resize', updateThumb);
  }, [children]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollTop = target.scrollTop;
    const scrollHeight = target.scrollHeight - target.clientHeight;

    if (scrollHeight > 0) {
      setScrollRatio(scrollTop / scrollHeight);
    }

    onScroll?.(e);
  };

  const showBar = showScrollbar === 'always' ||
    (showScrollbar === 'hover' && isHovered);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'relative',
      maxHeight,
      overflow: 'hidden',
    },
    content: {
      height: '100%',
      overflow: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
    },
    scrollbar: {
      position: 'absolute',
      top: 4,
      right: 4,
      bottom: 4,
      width: scrollbarWidth,
      borderRadius: scrollbarWidth / 2,
      background: 'var(--color-bg-tertiary)',
      opacity: showBar && thumbHeight > 0 ? 1 : 0,
      transition: 'opacity 0.2s',
    },
    thumb: {
      position: 'absolute',
      top: `${scrollRatio * (100 - (thumbHeight / (containerRef.current?.clientHeight || 1)) * 100)}%`,
      width: '100%',
      height: thumbHeight,
      borderRadius: scrollbarWidth / 2,
      background: 'var(--color-text-muted)',
      cursor: 'pointer',
      transition: 'background 0.15s',
    },
  };

  return (
    <div
      ref={containerRef}
      style={styles.container}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        ref={contentRef}
        style={styles.content}
        onScroll={handleScroll}
      >
        {children}
      </div>

      <div style={styles.scrollbar}>
        <div
          style={styles.thumb}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--color-text)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.background = 'var(--color-text-muted)';
          }}
        />
      </div>
    </div>
  );
};

// ==================== SCROLL TO TOP ====================

export const ScrollToTop: React.FC<ScrollToTopProps> = ({
  threshold = 300,
  smooth = true,
  position = 'bottom-right',
  offset = 24,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsVisible(window.scrollY > threshold);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [threshold]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  const getPosition = (): React.CSSProperties => {
    switch (position) {
      case 'bottom-left':
        return { left: offset, right: 'auto' };
      case 'bottom-center':
        return { left: '50%', right: 'auto', transform: 'translateX(-50%)' };
      default:
        return { right: offset, left: 'auto' };
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    button: {
      position: 'fixed',
      bottom: offset,
      ...getPosition(),
      width: 48,
      height: 48,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-accent)',
      border: 'none',
      borderRadius: '50%',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
      cursor: 'pointer',
      fontSize: 20,
      color: '#fff',
      opacity: isVisible ? 1 : 0,
      visibility: isVisible ? 'visible' : 'hidden',
      transform: isVisible ? 'scale(1)' : 'scale(0.8)',
      transition: 'all 0.3s',
      zIndex: 1000,
    },
  };

  return (
    <button
      style={styles.button}
      onClick={scrollToTop}
      aria-label="Scroll to top"
    >
      arrow-up
    </button>
  );
};

// ==================== SCROLL PROGRESS ====================

export const ScrollProgress: React.FC<ScrollProgressProps> = ({
  position = 'top',
  height = 4,
  color = 'var(--color-accent)',
}) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight > 0) {
        setProgress((window.scrollY / scrollHeight) * 100);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      position: 'fixed',
      [position]: 0,
      left: 0,
      right: 0,
      height,
      background: 'var(--color-bg-tertiary)',
      zIndex: 1000,
    },
    bar: {
      height: '100%',
      width: `${progress}%`,
      background: color,
      transition: 'width 0.1s',
    },
  };

  return (
    <div style={styles.container}>
      <div style={styles.bar} />
    </div>
  );
};

// ==================== SCROLL SPY ====================

export const ScrollSpy: React.FC<ScrollSpyProps> = ({
  sections,
  offset = 100,
  onSectionChange,
  children,
}) => {
  const [activeSection, setActiveSection] = useState(sections[0]?.id || '');

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + offset;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        const element = document.getElementById(section.id);

        if (element && element.offsetTop <= scrollPosition) {
          if (activeSection !== section.id) {
            setActiveSection(section.id);
            onSectionChange?.(section.id);
          }
          break;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [sections, offset, activeSection, onSectionChange]);

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      window.scrollTo({
        top: element.offsetTop - offset + 10,
        behavior: 'smooth',
      });
    }
  };

  const styles: Record<string, React.CSSProperties> = {
    container: {
      display: 'flex',
      gap: 24,
    },
    nav: {
      position: 'sticky',
      top: offset,
      display: 'flex',
      flexDirection: 'column',
      gap: 4,
      width: 200,
      flexShrink: 0,
      alignSelf: 'flex-start',
    },
    navItem: {
      padding: '8px 16px',
      background: 'none',
      border: 'none',
      borderLeft: '2px solid transparent',
      textAlign: 'left',
      fontSize: 14,
      color: 'var(--color-text-muted)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    },
    navItemActive: {
      borderLeftColor: 'var(--color-accent)',
      color: 'var(--color-accent)',
      background: 'rgba(var(--color-accent-rgb), 0.05)',
    },
    content: {
      flex: 1,
    },
  };

  return (
    <div style={styles.container}>
      <nav style={styles.nav as any}>
        {sections.map(section => (
          <button
            key={section.id}
            style={{
              ...styles.navItem,
              ...(activeSection === section.id ? styles.navItemActive : {}),
            }}
            onClick={() => scrollToSection(section.id)}
          >
            {section.label}
          </button>
        ))}
      </nav>
      <div style={styles.content}>{children}</div>
    </div>
  );
};

// ==================== PARALLAX SCROLL ====================

export const ParallaxScroll: React.FC<ParallaxScrollProps> = ({
  children,
  speed = 0.5,
  direction = 'up',
}) => {
  const [offset, setOffset] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!ref.current) return;

      const rect = ref.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const elementCenter = rect.top + rect.height / 2;
      const windowCenter = windowHeight / 2;

      const distance = elementCenter - windowCenter;
      const parallaxOffset = distance * speed * (direction === 'up' ? 1 : -1);

      setOffset(parallaxOffset);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [speed, direction]);

  const styles: Record<string, React.CSSProperties> = {
    container: {
      overflow: 'hidden',
    },
    content: {
      transform: `translateY(${offset}px)`,
      transition: 'transform 0.1s linear',
    },
  };

  return (
    <div ref={ref} style={styles.container}>
      <div style={styles.content}>{children}</div>
    </div>
  );
};

// ==================== HORIZONTAL SCROLL ====================

interface HorizontalScrollProps {
  children: React.ReactNode;
  showArrows?: boolean;
  gap?: number;
  padding?: number;
}

export const HorizontalScroll: React.FC<HorizontalScrollProps> = ({
  children,
  showArrows = true,
  gap = 16,
  padding = 16,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    if (!containerRef.current) return;

    const { scrollLeft, scrollWidth, clientWidth } = containerRef.current;
    setCanScrollLeft(scrollLeft > 0);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 1);
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener('resize', updateScrollState);
    return () => window.removeEventListener('resize', updateScrollState);
  }, [updateScrollState, children]);

  const scroll = (direction: 'left' | 'right') => {
    if (!containerRef.current) return;

    const scrollAmount = containerRef.current.clientWidth * 0.8;
    containerRef.current.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const styles: Record<string, React.CSSProperties> = {
    wrapper: {
      position: 'relative',
    },
    container: {
      display: 'flex',
      gap,
      padding,
      overflowX: 'auto',
      scrollbarWidth: 'none',
      msOverflowStyle: 'none',
      scrollSnapType: 'x mandatory',
    },
    arrow: {
      position: 'absolute',
      top: '50%',
      transform: 'translateY(-50%)',
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--color-bg-secondary)',
      border: '1px solid var(--color-border)',
      borderRadius: '50%',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
      cursor: 'pointer',
      fontSize: 18,
      color: 'var(--color-text)',
      zIndex: 10,
      transition: 'opacity 0.2s',
    },
    arrowLeft: {
      left: 8,
    },
    arrowRight: {
      right: 8,
    },
    arrowDisabled: {
      opacity: 0,
      pointerEvents: 'none',
    },
  };

  return (
    <div style={styles.wrapper}>
      {showArrows && (
        <>
          <button
            style={{
              ...styles.arrow,
              ...styles.arrowLeft,
              ...(canScrollLeft ? {} : styles.arrowDisabled),
            }}
            onClick={() => scroll('left')}
          >
            ‹
          </button>
          <button
            style={{
              ...styles.arrow,
              ...styles.arrowRight,
              ...(canScrollRight ? {} : styles.arrowDisabled),
            }}
            onClick={() => scroll('right')}
          >
            ›
          </button>
        </>
      )}

      <div
        ref={containerRef}
        style={styles.container}
        onScroll={updateScrollState}
      >
        {children}
      </div>
    </div>
  );
};

// ==================== SCROLL ANCHOR ====================

interface ScrollAnchorProps {
  id: string;
  offset?: number;
  children?: React.ReactNode;
}

export const ScrollAnchor: React.FC<ScrollAnchorProps> = ({
  id,
  offset = 0,
  children,
}) => {
  const styles: Record<string, React.CSSProperties> = {
    anchor: {
      position: 'relative',
    },
    target: {
      position: 'absolute',
      top: -offset,
      visibility: 'hidden',
    },
  };

  return (
    <div style={styles.anchor}>
      <div id={id} style={styles.target} />
      {children}
    </div>
  );
};

// ==================== USE SCROLL POSITION HOOK ====================

export const useScrollPosition = () => {
  const [scrollPosition, setScrollPosition] = useState({
    x: 0,
    y: 0,
    direction: 'none' as 'up' | 'down' | 'none',
    isAtTop: true,
    isAtBottom: false,
  });

  useEffect(() => {
    let lastScrollY = window.scrollY;

    const handleScroll = () => {
      const currentScrollY = window.scrollY;
      const direction = currentScrollY > lastScrollY ? 'down' : currentScrollY < lastScrollY ? 'up' : 'none';

      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;

      setScrollPosition({
        x: window.scrollX,
        y: currentScrollY,
        direction,
        isAtTop: currentScrollY <= 0,
        isAtBottom: currentScrollY + winHeight >= docHeight - 10,
      });

      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return scrollPosition;
};

export default ScrollArea;
