// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * PageTransition - Smooth page route change animations
 * 
 * Features:
 * - Fade + slide transition
 * - Respects reduce-motion preference
 * - Configurable direction and duration
 */

import React, { useEffect, useRef, useState } from 'react';
import { isReduceMotion, SPRING_PRESETS } from '../utils/MotionController';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageTransitionProps {
  /** Unique key for the current page (triggers transition on change) */
  pageKey: string;
  /** Transition direction */
  direction?: 'left' | 'right' | 'up' | 'down' | 'fade';
  /** Duration in ms */
  duration?: number;
  /** Children to render */
  children: React.ReactNode;
  /** Custom class name */
  className?: string;
  /** Custom style */
  style?: React.CSSProperties;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PageTransition: React.FC<PageTransitionProps> = ({
  pageKey,
  direction = 'fade',
  duration = 150,
  children,
  className = '',
  style = {},
}) => {
  const [currentKey, setCurrentKey] = useState(pageKey);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [phase, setPhase] = useState<'enter' | 'exit' | 'idle'>('idle');
  const contentRef = useRef<HTMLDivElement>(null);
  const prevChildrenRef = useRef<React.ReactNode>(children);

  useEffect(() => {
    if (pageKey !== currentKey) {
      // Start exit transition
      setIsTransitioning(true);
      setPhase('exit');

      const exitTimer = setTimeout(() => {
        // Switch content and start enter transition
        prevChildrenRef.current = children;
        setCurrentKey(pageKey);
        setPhase('enter');

        const enterTimer = setTimeout(() => {
          setIsTransitioning(false);
          setPhase('idle');
        }, isReduceMotion() ? 0 : duration);

        return () => clearTimeout(enterTimer);
      }, isReduceMotion() ? 0 : duration);

      return () => clearTimeout(exitTimer);
    }
  }, [pageKey, currentKey, children, duration]);

  // Update ref when children change during idle
  useEffect(() => {
    if (phase === 'idle') {
      prevChildrenRef.current = children;
    }
  }, [children, phase]);

  const getTransformStyle = (): React.CSSProperties => {
    if (isReduceMotion()) {
      return { opacity: phase === 'exit' ? 0 : 1 };
    }

    const offset = 20;
    let transform = 'translate3d(0, 0, 0)';
    let opacity = 1;

    if (phase === 'exit') {
      opacity = 0;
      switch (direction) {
        case 'left':
          transform = `translate3d(-${offset}px, 0, 0)`;
          break;
        case 'right':
          transform = `translate3d(${offset}px, 0, 0)`;
          break;
        case 'up':
          transform = `translate3d(0, -${offset}px, 0)`;
          break;
        case 'down':
          transform = `translate3d(0, ${offset}px, 0)`;
          break;
        case 'fade':
        default:
          transform = 'translate3d(0, 0, 0) scale(0.98)';
      }
    } else if (phase === 'enter') {
      opacity = 1;
      transform = 'translate3d(0, 0, 0)';
    }

    return {
      opacity,
      transform,
      transition: `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
    };
  };

  return (
    <div
      ref={contentRef}
      className={`dex-page-transition ${className}`}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...getTransformStyle(),
        ...style,
      }}
    >
      {isTransitioning && phase === 'exit' ? prevChildrenRef.current : children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Simpler fade wrapper
// ---------------------------------------------------------------------------

export interface FadeInProps {
  /** Delay before fade starts */
  delay?: number;
  /** Duration of fade */
  duration?: number;
  /** Children to render */
  children: React.ReactNode;
  /** Custom style */
  style?: React.CSSProperties;
}

export const FadeIn: React.FC<FadeInProps> = ({
  delay = 0,
  duration = 200,
  children,
  style = {},
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div
      style={{
        opacity: isVisible ? 1 : 0,
        transform: isVisible ? 'translateY(0)' : 'translateY(8px)',
        transition: isReduceMotion()
          ? 'none'
          : `opacity ${duration}ms ease-out, transform ${duration}ms ease-out`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stagger children animation
// ---------------------------------------------------------------------------

export interface StaggerProps {
  /** Delay between each child */
  stagger?: number;
  /** Initial delay before first child */
  initialDelay?: number;
  /** Duration for each child */
  duration?: number;
  /** Children to stagger */
  children: React.ReactNode[];
  /** Container style */
  style?: React.CSSProperties;
  /** Container class */
  className?: string;
}

export const Stagger: React.FC<StaggerProps> = ({
  stagger = 50,
  initialDelay = 0,
  duration = 200,
  children,
  style = {},
  className = '',
}) => {
  return (
    <div className={className} style={style}>
      {React.Children.map(children, (child, index) => (
        <FadeIn
          delay={initialDelay + index * stagger}
          duration={duration}
        >
          {child}
        </FadeIn>
      ))}
    </div>
  );
};

export default PageTransition;
