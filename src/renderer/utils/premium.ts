// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX Premium UI Utilities (Phase 1: Items 901-925)
// Premium visual effects, micro-interactions, and advanced UI patterns
// =============================================================================

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepthShadowConfig {
  elevation: 0 | 1 | 2 | 3 | 4;
  position?: { x: number; y: number };
  glowColor?: string;
}

export interface SpringConfig {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface ShimmerConfig {
  width?: number | string;
  height?: number | string;
  borderRadius?: number | string;
  duration?: number;
}

export interface StaggerConfig {
  delay: number;
  duration: number;
  easing: string;
}

export interface ParallaxConfig {
  depth: number;
  smoothing: number;
}

export interface SurfaceMaterial {
  type: 'frosted' | 'clear' | 'tinted' | 'matte';
  blur: number;
  saturation: number;
  tint?: string;
  opacity: number;
}

// ---------------------------------------------------------------------------
// 901. Depth-Aware Shadows
// ---------------------------------------------------------------------------

export function getDepthShadow(config: DepthShadowConfig): string {
  const { elevation, position, glowColor = 'rgba(74, 158, 255, 0.15)' } = config;
  
  // Calculate shadow offset based on element position (simulating light source at top-left)
  const offsetX = position ? Math.round((position.x / window.innerWidth - 0.5) * 8) : 0;
  const offsetY = position ? Math.round((position.y / window.innerHeight - 0.3) * 6) : 0;

  const shadows: Record<number, string> = {
    0: 'none',
    1: `${offsetX}px ${2 + offsetY}px 4px rgba(0,0,0,0.25), ${offsetX}px ${4 + offsetY}px 12px rgba(0,0,0,0.15)`,
    2: `${offsetX}px ${4 + offsetY}px 8px rgba(0,0,0,0.30), ${offsetX}px ${8 + offsetY}px 24px rgba(0,0,0,0.20), 0 0 12px ${glowColor}`,
    3: `${offsetX}px ${6 + offsetY}px 12px rgba(0,0,0,0.35), ${offsetX}px ${16 + offsetY}px 40px rgba(0,0,0,0.25), 0 0 20px ${glowColor}`,
    4: `${offsetX}px ${8 + offsetY}px 16px rgba(0,0,0,0.40), ${offsetX}px ${24 + offsetY}px 56px rgba(0,0,0,0.30), 0 0 32px ${glowColor}`,
  };

  return shadows[elevation] || shadows[0];
}

export function useDepthShadow(elevation: 0 | 1 | 2 | 3 | 4 = 2) {
  const ref = useRef<HTMLElement>(null);
  const [shadow, setShadow] = useState('');

  useEffect(() => {
    const updateShadow = () => {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      setShadow(getDepthShadow({ elevation, position: { x: centerX, y: centerY } }));
    };

    updateShadow();
    window.addEventListener('scroll', updateShadow, { passive: true });
    return () => window.removeEventListener('scroll', updateShadow);
  }, [elevation]);

  return { ref, shadow };
}

// ---------------------------------------------------------------------------
// 902. Variable Blur (Edge-enhanced blur)
// ---------------------------------------------------------------------------

export function createVariableBlur(intensity: number = 24): string {
  return `blur(${intensity}px)`;
}

export function getEdgeBlurGradient(direction: 'top' | 'bottom' | 'left' | 'right' = 'bottom'): string {
  const gradients: Record<string, string> = {
    top: 'linear-gradient(to top, transparent, rgba(0,0,0,0.3))',
    bottom: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.3))',
    left: 'linear-gradient(to left, transparent, rgba(0,0,0,0.3))',
    right: 'linear-gradient(to right, transparent, rgba(0,0,0,0.3))',
  };
  return gradients[direction];
}

// ---------------------------------------------------------------------------
// 903. Ambient Light Color Extraction
// ---------------------------------------------------------------------------

export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve('#4A9EFF');
        return;
      }

      canvas.width = 10;
      canvas.height = 10;
      ctx.drawImage(img, 0, 0, 10, 10);

      const imageData = ctx.getImageData(0, 0, 10, 10).data;
      let r = 0, g = 0, b = 0, count = 0;

      for (let i = 0; i < imageData.length; i += 4) {
        r += imageData[i];
        g += imageData[i + 1];
        b += imageData[i + 2];
        count++;
      }

      r = Math.round(r / count);
      g = Math.round(g / count);
      b = Math.round(b / count);

      resolve(`rgb(${r}, ${g}, ${b})`);
    };
    img.onerror = () => resolve('#4A9EFF');
    img.src = imageUrl;
  });
}

export function useAmbientColor(imageUrl: string | null) {
  const [color, setColor] = useState<string>('#4A9EFF');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!imageUrl) return;
    setLoading(true);
    extractDominantColor(imageUrl)
      .then(setColor)
      .finally(() => setLoading(false));
  }, [imageUrl]);

  return { color, loading };
}

// ---------------------------------------------------------------------------
// 904. Spring Physics Micro-interactions
// ---------------------------------------------------------------------------

export const springPresets: Record<string, SpringConfig> = {
  gentle: { stiffness: 120, damping: 14, mass: 1 },
  bouncy: { stiffness: 180, damping: 12, mass: 1 },
  stiff: { stiffness: 300, damping: 20, mass: 1 },
  wobbly: { stiffness: 180, damping: 10, mass: 1 },
  slow: { stiffness: 80, damping: 20, mass: 1 },
};

export function springAnimation(config: SpringConfig = springPresets.gentle): string {
  // Convert spring physics to CSS cubic-bezier approximation
  const { stiffness, damping } = config;
  const omega = Math.sqrt(stiffness);
  const zeta = damping / (2 * omega);
  
  // Approximate spring as cubic-bezier
  const x1 = 0.5 - zeta * 0.3;
  const y1 = 1 + (1 - zeta) * 0.5;
  const x2 = 0.5 + zeta * 0.2;
  const y2 = 1;
  
  return `cubic-bezier(${x1.toFixed(3)}, ${y1.toFixed(3)}, ${x2.toFixed(3)}, ${y2.toFixed(3)})`;
}

export function getSpringTransition(property: string = 'all', config: SpringConfig = springPresets.gentle): string {
  const duration = Math.round(1000 / Math.sqrt(config.stiffness) * 4);
  return `${property} ${duration}ms ${springAnimation(config)}`;
}

export function useSpringValue(targetValue: number, config: SpringConfig = springPresets.gentle) {
  const [value, setValue] = useState(targetValue);
  const velocity = useRef(0);
  const frameRef = useRef<number>();

  useEffect(() => {
    const animate = () => {
      const diff = targetValue - value;
      const spring = diff * config.stiffness * 0.001;
      const damper = velocity.current * config.damping * 0.01;
      
      velocity.current += (spring - damper) / config.mass;
      const newValue = value + velocity.current;
      
      if (Math.abs(diff) < 0.01 && Math.abs(velocity.current) < 0.01) {
        setValue(targetValue);
        return;
      }
      
      setValue(newValue);
      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [targetValue, config, value]);

  return value;
}

// ---------------------------------------------------------------------------
// 905. Hover Glow Following Cursor
// ---------------------------------------------------------------------------

export function useHoverGlow(glowColor: string = 'rgba(74, 158, 255, 0.3)', glowSize: number = 150) {
  const ref = useRef<HTMLElement>(null);
  const [glowStyle, setGlowStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      setGlowStyle({
        background: `radial-gradient(${glowSize}px circle at ${x}px ${y}px, ${glowColor}, transparent)`,
      });
    };

    const handleMouseLeave = () => {
      setGlowStyle({});
    };

    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [glowColor, glowSize]);

  return { ref, glowStyle };
}

// ---------------------------------------------------------------------------
// 906. Adaptive Contrast
// ---------------------------------------------------------------------------

export function getLuminance(color: string): number {
  // Convert hex or rgb to luminance
  let r: number, g: number, b: number;

  if (color.startsWith('#')) {
    const hex = color.slice(1);
    r = parseInt(hex.slice(0, 2), 16) / 255;
    g = parseInt(hex.slice(2, 4), 16) / 255;
    b = parseInt(hex.slice(4, 6), 16) / 255;
  } else if (color.startsWith('rgb')) {
    const match = color.match(/\d+/g);
    if (!match) return 0;
    [r, g, b] = match.map(n => parseInt(n) / 255);
  } else {
    return 0;
  }

  // Apply gamma correction
  r = r <= 0.03928 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.03928 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.03928 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getContrastColor(backgroundColor: string): 'light' | 'dark' {
  const luminance = getLuminance(backgroundColor);
  return luminance > 0.179 ? 'dark' : 'light';
}

export function getAdaptiveTextColor(backgroundColor: string): string {
  return getContrastColor(backgroundColor) === 'dark' ? '#000000' : '#FFFFFF';
}

// ---------------------------------------------------------------------------
// 907. Glass Edge Highlights
// ---------------------------------------------------------------------------

export function getGlassEdgeHighlight(direction: 'top' | 'left' | 'all' = 'all'): string {
  const gradients: Record<string, string> = {
    top: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 2px)',
    left: 'linear-gradient(90deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 2px)',
    all: 'linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 1px)',
  };
  return gradients[direction];
}

export function getGlassBorder(): string {
  return '1px solid rgba(255, 255, 255, 0.14)';
}

// ---------------------------------------------------------------------------
// 908. Smooth Theme Transitions
// ---------------------------------------------------------------------------

export function enableThemeTransition(duration: number = 300) {
  document.documentElement.style.setProperty('--theme-transition', `${duration}ms`);
  document.documentElement.classList.add('theme-transitioning');
  
  setTimeout(() => {
    document.documentElement.classList.remove('theme-transitioning');
  }, duration);
}

// ---------------------------------------------------------------------------
// 909. Layered Shadow System (Contact + Ambient)
// ---------------------------------------------------------------------------

export function getLayeredShadow(elevation: number = 2): string {
  // Contact shadow (small, sharp, directly under element)
  const contactY = Math.min(elevation, 4);
  const contactBlur = elevation * 2;
  const contactOpacity = 0.15 + elevation * 0.03;
  const contact = `0 ${contactY}px ${contactBlur}px rgba(0,0,0,${contactOpacity})`;

  // Ambient shadow (large, soft, diffuse)
  const ambientY = elevation * 4;
  const ambientBlur = elevation * 12;
  const ambientOpacity = 0.08 + elevation * 0.02;
  const ambient = `0 ${ambientY}px ${ambientBlur}px rgba(0,0,0,${ambientOpacity})`;

  return `${contact}, ${ambient}`;
}

// ---------------------------------------------------------------------------
// 910. Subtle Noise Texture
// ---------------------------------------------------------------------------

export function getNoiseTexture(opacity: number = 0.03): string {
  // Generate SVG noise pattern as data URI
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="4" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter><rect width="100%" height="100%" filter="url(#noise)" opacity="${opacity}"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export function useNoiseBackground(opacity: number = 0.03) {
  return useMemo(() => ({
    backgroundImage: getNoiseTexture(opacity),
    backgroundRepeat: 'repeat',
  }), [opacity]);
}

// ---------------------------------------------------------------------------
// 911. Cursor Trail Effects
// ---------------------------------------------------------------------------

export function useCursorTrail(enabled: boolean = false, trailLength: number = 5) {
  const [trails, setTrails] = useState<{ x: number; y: number; id: number }[]>([]);
  const idRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const handleMouseMove = (e: MouseEvent) => {
      idRef.current++;
      setTrails(prev => {
        const newTrails = [...prev, { x: e.clientX, y: e.clientY, id: idRef.current }];
        return newTrails.slice(-trailLength);
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [enabled, trailLength]);

  return trails;
}

// ---------------------------------------------------------------------------
// 912. Magnetic Snap Feedback
// ---------------------------------------------------------------------------

export function useMagneticSnap(threshold: number = 10, strength: number = 0.3) {
  const ref = useRef<HTMLElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const handleMouseMove = (e: MouseEvent) => {
      const rect = element.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      const distX = e.clientX - centerX;
      const distY = e.clientY - centerY;
      const distance = Math.sqrt(distX * distX + distY * distY);
      
      if (distance < rect.width / 2 + threshold) {
        setOffset({
          x: distX * strength,
          y: distY * strength,
        });
      }
    };

    const handleMouseLeave = () => {
      setOffset({ x: 0, y: 0 });
    };

    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      element.removeEventListener('mousemove', handleMouseMove);
      element.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [threshold, strength]);

  return { ref, offset };
}

// ---------------------------------------------------------------------------
// 913. Parallax Depth Effects
// ---------------------------------------------------------------------------

export function useParallaxDepth(config: ParallaxConfig = { depth: 10, smoothing: 0.1 }) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const targetOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX - window.innerWidth / 2) / window.innerWidth * config.depth;
      const y = (e.clientY - window.innerHeight / 2) / window.innerHeight * config.depth;
      targetOffset.current = { x, y };
    };

    const animate = () => {
      setOffset(prev => ({
        x: prev.x + (targetOffset.current.x - prev.x) * config.smoothing,
        y: prev.y + (targetOffset.current.y - prev.y) * config.smoothing,
      }));
      requestAnimationFrame(animate);
    };

    window.addEventListener('mousemove', handleMouseMove);
    const frameId = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, [config.depth, config.smoothing]);

  return offset;
}

// ---------------------------------------------------------------------------
// 914. Smooth Icon Morphing
// ---------------------------------------------------------------------------

export function getMorphTransition(duration: number = 200): string {
  return `d ${duration}ms cubic-bezier(0.4, 0, 0.2, 1)`;
}

// ---------------------------------------------------------------------------
// 915. Radial Gradient Accents
// ---------------------------------------------------------------------------

export function getRadialAccent(color: string = '#4A9EFF', intensity: number = 0.15): string {
  return `radial-gradient(circle at 50% 0%, ${color}${Math.round(intensity * 255).toString(16).padStart(2, '0')}, transparent 70%)`;
}

// ---------------------------------------------------------------------------
// 916. Shimmer Loading States
// ---------------------------------------------------------------------------

export function getShimmerGradient(): string {
  return 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)';
}

export function Shimmer({ width = '100%', height = 16, borderRadius = 4 }: ShimmerConfig) {
  return {
    width,
    height,
    borderRadius,
    background: 'rgba(255, 255, 255, 0.06)',
    position: 'relative' as const,
    overflow: 'hidden' as const,
    '&::after': {
      content: '""',
      position: 'absolute',
      inset: 0,
      background: getShimmerGradient(),
      animation: 'shimmer 1.5s infinite',
    },
  };
}

// CSS keyframes for shimmer (add to globals.css)
export const shimmerKeyframes = `
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
`;

// ---------------------------------------------------------------------------
// 917. Staggered Animation Entry
// ---------------------------------------------------------------------------

export function getStaggerDelay(index: number, baseDelay: number = 50, maxDelay: number = 500): number {
  return Math.min(index * baseDelay, maxDelay);
}

export function getStaggerAnimation(index: number, config: StaggerConfig = { delay: 50, duration: 300, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' }): React.CSSProperties {
  const delay = Math.min(index * config.delay, 500);
  return {
    opacity: 0,
    transform: 'translateY(8px)',
    animation: `fadeInUp ${config.duration}ms ${config.easing} ${delay}ms forwards`,
  };
}

export function useStaggeredEntry(itemCount: number, baseDelay: number = 50) {
  const [visible, setVisible] = useState<number[]>([]);

  useEffect(() => {
    const timeouts: number[] = [];
    
    for (let i = 0; i < itemCount; i++) {
      timeouts.push(window.setTimeout(() => {
        setVisible(prev => [...prev, i]);
      }, i * baseDelay));
    }

    return () => timeouts.forEach(clearTimeout);
  }, [itemCount, baseDelay]);

  return visible;
}

// ---------------------------------------------------------------------------
// 918. Elastic Rubber-band Scroll
// ---------------------------------------------------------------------------

export function useElasticScroll(maxOverscroll: number = 100) {
  const ref = useRef<HTMLElement>(null);
  const [overscroll, setOverscroll] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    let startY = 0;
    let currentOverscroll = 0;

    const handleTouchStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const y = e.touches[0].clientY;
      const diff = y - startY;
      
      if (element.scrollTop === 0 && diff > 0) {
        currentOverscroll = Math.min(diff * 0.4, maxOverscroll);
        setOverscroll(currentOverscroll);
      } else if (element.scrollTop >= element.scrollHeight - element.clientHeight && diff < 0) {
        currentOverscroll = Math.max(diff * 0.4, -maxOverscroll);
        setOverscroll(currentOverscroll);
      }
    };

    const handleTouchEnd = () => {
      setOverscroll(0);
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchmove', handleTouchMove, { passive: true });
    element.addEventListener('touchend', handleTouchEnd);

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchmove', handleTouchMove);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [maxOverscroll]);

  return { ref, overscroll };
}

// ---------------------------------------------------------------------------
// 919. Glow Pulse on Notifications
// ---------------------------------------------------------------------------

export function getGlowPulse(color: string = '#4A9EFF'): string {
  return `0 0 0 0 ${color}`;
}

export const glowPulseKeyframes = `
@keyframes glowPulse {
  0%, 100% { box-shadow: 0 0 8px rgba(74, 158, 255, 0.3), 0 0 16px rgba(74, 158, 255, 0.15); }
  50% { box-shadow: 0 0 16px rgba(74, 158, 255, 0.5), 0 0 32px rgba(74, 158, 255, 0.25); }
}
`;

// ---------------------------------------------------------------------------
// 920. Smooth Number Counter
// ---------------------------------------------------------------------------

export function useCountUp(target: number, duration: number = 1000) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number>();
  const startValue = useRef(0);

  useEffect(() => {
    startValue.current = value;
    startTime.current = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - (startTime.current || 0);
      const progress = Math.min(elapsed / duration, 1);
      
      // Ease out
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue.current + (target - startValue.current) * eased;
      
      setValue(Math.round(current));
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target, duration]);

  return value;
}

// ---------------------------------------------------------------------------
// 921. Fluid Card Transitions
// ---------------------------------------------------------------------------

export function useCardExpand() {
  const [expanded, setExpanded] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const ref = useRef<HTMLElement>(null);

  const expand = useCallback(() => {
    if (ref.current) {
      setRect(ref.current.getBoundingClientRect());
      setExpanded(true);
    }
  }, []);

  const collapse = useCallback(() => {
    setExpanded(false);
  }, []);

  return { ref, expanded, rect, expand, collapse };
}

// ---------------------------------------------------------------------------
// 922. Surface Materials (visionOS-style)
// ---------------------------------------------------------------------------

export function getSurfaceMaterial(material: SurfaceMaterial): React.CSSProperties {
  const base: React.CSSProperties = {
    backdropFilter: `blur(${material.blur}px) saturate(${material.saturation}%)`,
    WebkitBackdropFilter: `blur(${material.blur}px) saturate(${material.saturation}%)`,
  };

  switch (material.type) {
    case 'frosted':
      return {
        ...base,
        background: `rgba(255, 255, 255, ${material.opacity})`,
      };
    case 'clear':
      return {
        ...base,
        background: `rgba(22, 22, 26, ${material.opacity})`,
      };
    case 'tinted':
      return {
        ...base,
        background: material.tint ? `${material.tint}${Math.round(material.opacity * 255).toString(16)}` : `rgba(74, 158, 255, ${material.opacity})`,
      };
    case 'matte':
      return {
        background: `rgba(30, 30, 34, ${material.opacity})`,
      };
    default:
      return base;
  }
}

export const surfacePresets: Record<string, SurfaceMaterial> = {
  glassPanel: { type: 'clear', blur: 24, saturation: 180, opacity: 0.85 },
  frostedCard: { type: 'frosted', blur: 32, saturation: 150, opacity: 0.08 },
  tintedOverlay: { type: 'tinted', blur: 20, saturation: 120, opacity: 0.15 },
  mattePanel: { type: 'matte', blur: 0, saturation: 100, opacity: 0.95 },
};

// ---------------------------------------------------------------------------
// 923. Adaptive Typography Scaling
// ---------------------------------------------------------------------------

export function getScaledFontSize(basePx: number, scale: number = 1): number {
  return Math.round(basePx * scale);
}

export function useTextScaling(userScale: number = 1) {
  return useMemo(() => ({
    xs: getScaledFontSize(11, userScale),
    sm: getScaledFontSize(13, userScale),
    base: getScaledFontSize(15, userScale),
    lg: getScaledFontSize(18, userScale),
    xl: getScaledFontSize(24, userScale),
    '2xl': getScaledFontSize(32, userScale),
  }), [userScale]);
}

// ---------------------------------------------------------------------------
// 924. Gesture-Driven Zoom/Pan Inertia
// ---------------------------------------------------------------------------

export function useZoomPanInertia(friction: number = 0.95) {
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const velocity = useRef({ x: 0, y: 0 });
  const animating = useRef(false);

  const applyVelocity = useCallback((vx: number, vy: number) => {
    velocity.current = { x: vx, y: vy };
    
    if (animating.current) return;
    animating.current = true;

    const animate = () => {
      velocity.current.x *= friction;
      velocity.current.y *= friction;

      if (Math.abs(velocity.current.x) > 0.1 || Math.abs(velocity.current.y) > 0.1) {
        setTransform(prev => ({
          ...prev,
          x: prev.x + velocity.current.x,
          y: prev.y + velocity.current.y,
        }));
        requestAnimationFrame(animate);
      } else {
        animating.current = false;
      }
    };

    requestAnimationFrame(animate);
  }, [friction]);

  const setScale = useCallback((scale: number) => {
    setTransform(prev => ({ ...prev, scale: Math.max(0.1, Math.min(10, scale)) }));
  }, []);

  const setPosition = useCallback((x: number, y: number) => {
    setTransform(prev => ({ ...prev, x, y }));
  }, []);

  return { transform, applyVelocity, setScale, setPosition };
}

// ---------------------------------------------------------------------------
// 925. Premium Focus Rings
// ---------------------------------------------------------------------------

export function getPremiumFocusRing(color: string = '#4A9EFF'): string {
  return `0 0 0 2px ${color}40, 0 0 0 4px ${color}20, 0 0 12px ${color}30`;
}

export function useFocusRing() {
  const [focused, setFocused] = useState(false);
  
  const focusProps = {
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  const focusStyle: React.CSSProperties = focused ? {
    boxShadow: getPremiumFocusRing(),
    outline: 'none',
  } : {};

  return { focused, focusProps, focusStyle };
}

// ---------------------------------------------------------------------------
// React Components for Premium UI
// ---------------------------------------------------------------------------

export function createShimmerStyle(config: ShimmerConfig = {}): React.CSSProperties {
  return {
    width: config.width ?? '100%',
    height: config.height ?? 16,
    borderRadius: config.borderRadius ?? 4,
    background: 'rgba(255, 255, 255, 0.06)',
    position: 'relative',
    overflow: 'hidden',
  };
}

// ---------------------------------------------------------------------------
// Premium CSS Variables (inject into :root)
// ---------------------------------------------------------------------------

export const premiumCSSVariables = `
  /* Premium Shadows */
  --shadow-premium-sm: 0 2px 4px rgba(0,0,0,0.25), 0 4px 12px rgba(0,0,0,0.15);
  --shadow-premium-md: 0 4px 8px rgba(0,0,0,0.30), 0 8px 24px rgba(0,0,0,0.20), 0 0 12px rgba(74, 158, 255, 0.08);
  --shadow-premium-lg: 0 6px 12px rgba(0,0,0,0.35), 0 16px 40px rgba(0,0,0,0.25), 0 0 20px rgba(74, 158, 255, 0.12);
  --shadow-premium-xl: 0 8px 16px rgba(0,0,0,0.40), 0 24px 56px rgba(0,0,0,0.30), 0 0 32px rgba(74, 158, 255, 0.15);
  
  /* Premium Focus */
  --focus-ring-premium: 0 0 0 2px rgba(74, 158, 255, 0.4), 0 0 0 4px rgba(74, 158, 255, 0.2), 0 0 12px rgba(74, 158, 255, 0.3);
  
  /* Surface Materials */
  --surface-glass: rgba(22, 22, 26, 0.85);
  --surface-frosted: rgba(255, 255, 255, 0.08);
  --surface-tinted: rgba(74, 158, 255, 0.15);
  --surface-matte: rgba(30, 30, 34, 0.95);
  
  /* Premium Borders */
  --border-glass-highlight: linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0) 100%);
  
  /* Premium Transitions */
  --transition-spring: 200ms cubic-bezier(0.34, 1.56, 0.64, 1);
  --transition-smooth: 300ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-bounce: 400ms cubic-bezier(0.175, 0.885, 0.32, 1.275);
`;
