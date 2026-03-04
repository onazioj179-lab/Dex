/**
 * DEX Animation Components
 * CSS transitions and animations
 */

import React, { useState, useEffect, useRef } from 'react';

// ==================== TYPES ====================

interface FadeProps {
  children: React.ReactNode;
  show: boolean;
  duration?: number;
  unmountOnExit?: boolean;
}

interface SlideProps {
  children: React.ReactNode;
  show: boolean;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  distance?: number;
  unmountOnExit?: boolean;
}

interface ScaleProps {
  children: React.ReactNode;
  show: boolean;
  duration?: number;
  origin?: string;
  unmountOnExit?: boolean;
}

interface CollapseProps {
  children: React.ReactNode;
  isOpen: boolean;
  duration?: number;
}

interface StaggerProps {
  children: React.ReactNode[];
  show: boolean;
  staggerDelay?: number;
  animation?: 'fade' | 'slideUp' | 'scale';
}

interface AnimateOnScrollProps {
  children: React.ReactNode;
  animation?: 'fadeIn' | 'fadeUp' | 'fadeDown' | 'fadeLeft' | 'fadeRight' | 'scale' | 'rotate';
  duration?: number;
  delay?: number;
  threshold?: number;
  once?: boolean;
}

// ==================== FADE ====================

export const Fade: React.FC<FadeProps> = ({
  children,
  show,
  duration = 200,
  unmountOnExit = true,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [opacity, setOpacity] = useState(show ? 1 : 0);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      requestAnimationFrame(() => setOpacity(1));
    } else {
      setOpacity(0);
      if (unmountOnExit) {
        setTimeout(() => setShouldRender(false), duration);
      }
    }
  }, [show, duration, unmountOnExit]);

  if (!shouldRender && unmountOnExit) return null;

  return (
    <div
      style={{
        opacity,
        transition: `opacity ${duration}ms ease-in-out`,
      }}
    >
      {children}
    </div>
  );
};

// ==================== SLIDE ====================

export const Slide: React.FC<SlideProps> = ({
  children,
  show,
  direction = 'up',
  duration = 300,
  distance = 20,
  unmountOnExit = true,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      if (unmountOnExit) {
        setTimeout(() => setShouldRender(false), duration);
      }
    }
  }, [show, duration, unmountOnExit]);

  if (!shouldRender && unmountOnExit) return null;

  const getTransform = () => {
    if (isVisible) return 'translate(0, 0)';

    switch (direction) {
      case 'up':
        return `translateY(${distance}px)`;
      case 'down':
        return `translateY(-${distance}px)`;
      case 'left':
        return `translateX(${distance}px)`;
      case 'right':
        return `translateX(-${distance}px)`;
      default:
        return 'translate(0, 0)';
    }
  };

  return (
    <div
      style={{
        opacity: isVisible ? 1 : 0,
        transform: getTransform(),
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
};

// ==================== SCALE ====================

export const Scale: React.FC<ScaleProps> = ({
  children,
  show,
  duration = 200,
  origin = 'center center',
  unmountOnExit = true,
}) => {
  const [shouldRender, setShouldRender] = useState(show);
  const [isVisible, setIsVisible] = useState(show);

  useEffect(() => {
    if (show) {
      setShouldRender(true);
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
      if (unmountOnExit) {
        setTimeout(() => setShouldRender(false), duration);
      }
    }
  }, [show, duration, unmountOnExit]);

  if (!shouldRender && unmountOnExit) return null;

  return (
    <div
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'scale(1)' : 'scale(0.9)',
        transformOrigin: origin,
        transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
      }}
    >
      {children}
    </div>
  );
};

// ==================== COLLAPSE ====================

export const Collapse: React.FC<CollapseProps> = ({
  children,
  isOpen,
  duration = 300,
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | 'auto'>(isOpen ? 'auto' : 0);

  useEffect(() => {
    if (!contentRef.current) return;

    if (isOpen) {
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(contentHeight);
      setTimeout(() => setHeight('auto'), duration);
    } else {
      const contentHeight = contentRef.current.scrollHeight;
      setHeight(contentHeight);
      requestAnimationFrame(() => setHeight(0));
    }
  }, [isOpen, duration]);

  return (
    <div
      style={{
        height,
        overflow: 'hidden',
        transition: height === 'auto' ? undefined : `height ${duration}ms ease-out`,
      }}
    >
      <div ref={contentRef}>{children}</div>
    </div>
  );
};

// ==================== STAGGER ====================

export const Stagger: React.FC<StaggerProps> = ({
  children,
  show,
  staggerDelay = 50,
  animation = 'fade',
}) => {
  const getAnimationStyle = (index: number, isVisible: boolean): React.CSSProperties => {
    const delay = index * staggerDelay;

    if (!isVisible) {
      return {
        opacity: 0,
        transform: animation === 'slideUp' ? 'translateY(20px)' : animation === 'scale' ? 'scale(0.9)' : undefined,
        transition: `opacity 300ms ease-out ${delay}ms, transform 300ms ease-out ${delay}ms`,
      };
    }

    return {
      opacity: 1,
      transform: 'none',
      transition: `opacity 300ms ease-out ${delay}ms, transform 300ms ease-out ${delay}ms`,
    };
  };

  return (
    <>
      {children.map((child, index) => (
        <div key={index} style={getAnimationStyle(index, show)}>
          {child}
        </div>
      ))}
    </>
  );
};

// ==================== ANIMATE ON SCROLL ====================

export const AnimateOnScroll: React.FC<AnimateOnScrollProps> = ({
  children,
  animation = 'fadeIn',
  duration = 600,
  delay = 0,
  threshold = 0.1,
  once = true,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { threshold }
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, [threshold, once]);

  const getInitialStyles = (): React.CSSProperties => {
    switch (animation) {
      case 'fadeUp':
        return { opacity: 0, transform: 'translateY(30px)' };
      case 'fadeDown':
        return { opacity: 0, transform: 'translateY(-30px)' };
      case 'fadeLeft':
        return { opacity: 0, transform: 'translateX(30px)' };
      case 'fadeRight':
        return { opacity: 0, transform: 'translateX(-30px)' };
      case 'scale':
        return { opacity: 0, transform: 'scale(0.8)' };
      case 'rotate':
        return { opacity: 0, transform: 'rotate(-10deg)' };
      default:
        return { opacity: 0 };
    }
  };

  const getAnimatedStyles = (): React.CSSProperties => {
    return {
      opacity: 1,
      transform: 'none',
    };
  };

  return (
    <div
      ref={ref}
      style={{
        ...(isVisible ? getAnimatedStyles() : getInitialStyles()),
        transition: `opacity ${duration}ms ease-out ${delay}ms, transform ${duration}ms ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
};

// ==================== PULSE ====================

interface PulseProps {
  children: React.ReactNode;
  isActive?: boolean;
  color?: string;
}

export const Pulse: React.FC<PulseProps> = ({
  children,
  isActive = true,
  color = 'var(--color-accent)',
}) => {
  if (!isActive) return <>{children}</>;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {children}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          background: color,
          opacity: 0.4,
          animation: 'pulse 2s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.05); opacity: 0.2; }
        }
      `}</style>
    </div>
  );
};

// ==================== SHAKE ====================

interface ShakeProps {
  children: React.ReactNode;
  trigger?: boolean;
  intensity?: number;
  duration?: number;
}

export const Shake: React.FC<ShakeProps> = ({
  children,
  trigger = false,
  intensity = 10,
  duration = 500,
}) => {
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (trigger) {
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), duration);
    }
  }, [trigger, duration]);

  return (
    <div
      style={{
        animation: isShaking ? `shake ${duration}ms ease-in-out` : undefined,
      }}
    >
      {children}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-${intensity}px); }
          20%, 40%, 60%, 80% { transform: translateX(${intensity}px); }
        }
      `}</style>
    </div>
  );
};

// ==================== BOUNCE ====================

interface BounceProps {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
}

export const Bounce: React.FC<BounceProps> = ({
  children,
  delay = 0,
  duration = 1000,
}) => {
  return (
    <div
      style={{
        animation: `bounce ${duration}ms ease-in-out ${delay}ms infinite`,
      }}
    >
      {children}
      <style>{`
        @keyframes bounce {
          0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
          40% { transform: translateY(-20px); }
          60% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

// ==================== SPIN ====================

interface SpinProps {
  children: React.ReactNode;
  duration?: number;
  reverse?: boolean;
}

export const Spin: React.FC<SpinProps> = ({
  children,
  duration = 1000,
  reverse = false,
}) => {
  return (
    <div
      style={{
        animation: `spin ${duration}ms linear infinite ${reverse ? 'reverse' : ''}`,
        display: 'inline-block',
      }}
    >
      {children}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

// ==================== TRANSITION GROUP ====================

interface TransitionGroupProps {
  children: React.ReactNode[];
  animation?: 'fade' | 'slide' | 'scale';
  duration?: number;
}

export const TransitionGroup: React.FC<TransitionGroupProps> = ({
  children,
  animation = 'fade',
  duration = 300,
}) => {
  const [items, setItems] = useState(children);
  const previousItems = useRef(children);

  useEffect(() => {
    const entering = children.filter(
      (child) =>
        !previousItems.current.some(
          (prev) => React.isValidElement(prev) && React.isValidElement(child) && prev.key === child.key
        )
    );

    const exiting = previousItems.current.filter(
      (prev) =>
        !children.some(
          (child) => React.isValidElement(prev) && React.isValidElement(child) && prev.key === child.key
        )
    );

    // Simple implementation: just update items
    setItems(children);
    previousItems.current = children;
  }, [children]);

  const getAnimationClass = () => {
    switch (animation) {
      case 'slide':
        return { transform: 'translateY(0)', opacity: 1 };
      case 'scale':
        return { transform: 'scale(1)', opacity: 1 };
      default:
        return { opacity: 1 };
    }
  };

  return (
    <>
      {items.map((child, index) => (
        <div
          key={React.isValidElement(child) ? (child.key ?? index) : index}
          style={{
            ...getAnimationClass(),
            transition: `all ${duration}ms ease-out`,
          }}
        >
          {child}
        </div>
      ))}
    </>
  );
};

// ==================== TYPEWRITER ====================

interface TypewriterProps {
  text: string;
  speed?: number;
  delay?: number;
  cursor?: boolean;
  onComplete?: () => void;
}

export const Typewriter: React.FC<TypewriterProps> = ({
  text,
  speed = 50,
  delay = 0,
  cursor = true,
  onComplete,
}) => {
  const [displayText, setDisplayText] = useState('');
  const [showCursor, setShowCursor] = useState(true);

  useEffect(() => {
    let timeout: NodeJS.Timeout;
    let index = 0;

    const startTyping = () => {
      if (index < text.length) {
        setDisplayText(text.slice(0, index + 1));
        index++;
        timeout = setTimeout(startTyping, speed);
      } else {
        onComplete?.();
      }
    };

    timeout = setTimeout(startTyping, delay);

    return () => clearTimeout(timeout);
  }, [text, speed, delay, onComplete]);

  useEffect(() => {
    if (!cursor) return;

    const interval = setInterval(() => {
      setShowCursor((prev) => !prev);
    }, 500);

    return () => clearInterval(interval);
  }, [cursor]);

  return (
    <span>
      {displayText}
      {cursor && (
        <span style={{ opacity: showCursor ? 1 : 0 }}>|</span>
      )}
    </span>
  );
};

export default Fade;
