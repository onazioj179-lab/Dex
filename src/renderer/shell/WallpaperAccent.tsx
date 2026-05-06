// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Wallpaper Accent System
 * Extracts dominant colors from wallpaper images using k-means clustering,
 * derives accent palette, and provides crossfade wallpaper transitions.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { isReduceMotion } from '../utils/MotionController';

// =========================================================================
// COLOR EXTRACTION (k-means simplified)
// =========================================================================

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

function averageColors(colors: RGBColor[]): RGBColor {
  if (colors.length === 0) return { r: 128, g: 128, b: 128 };
  let rSum = 0, gSum = 0, bSum = 0;
  for (const c of colors) { rSum += c.r; gSum += c.g; bSum += c.b; }
  return {
    r: Math.round(rSum / colors.length),
    g: Math.round(gSum / colors.length),
    b: Math.round(bSum / colors.length),
  };
}

/**
 * k-means color clustering on pixel data.
 * Returns k dominant colors sorted by frequency (most common first).
 */
function kMeansClusters(pixels: RGBColor[], k: number, maxIterations = 10): RGBColor[] {
  if (pixels.length === 0) return [];

  // Initialize centroids by evenly spaced sampling
  const step = Math.max(1, Math.floor(pixels.length / k));
  const centroids: RGBColor[] = [];
  for (let i = 0; i < k; i++) {
    centroids.push({ ...pixels[Math.min(i * step, pixels.length - 1)] });
  }

  let assignments = new Array(pixels.length).fill(0);

  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;

    // Assign each pixel to closest centroid
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let best = 0;
      for (let c = 0; c < centroids.length; c++) {
        const dist = colorDistance(pixels[i], centroids[c]);
        if (dist < minDist) { minDist = dist; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }

    if (!changed) break;

    // Recompute centroids
    for (let c = 0; c < centroids.length; c++) {
      const group = pixels.filter((_, i) => assignments[i] === c);
      if (group.length > 0) {
        centroids[c] = averageColors(group);
      }
    }
  }

  // Count cluster sizes and sort by frequency
  const counts = new Array(k).fill(0);
  for (const a of assignments) counts[a]++;

  const sorted = centroids
    .map((c, i) => ({ color: c, count: counts[i] }))
    .sort((a, b) => b.count - a.count);

  return sorted.map(s => s.color);
}

function rgbToHex(c: RGBColor): string {
  return `#${((1 << 24) + (c.r << 16) + (c.g << 8) + c.b).toString(16).slice(1)}`;
}

function luminance(c: RGBColor): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

export interface WallpaperPalette {
  dominant: string;
  secondary: string;
  accent: string;
  muted: string;
  dark: string;
  colors: string[];
}

/**
 * Extract palette from an image source.
 * Uses offscreen canvas to sample, then k-means clustering.
 */
export async function extractPalette(imageSrc: string, k = 5): Promise<WallpaperPalette> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Downscale for speed
      const scale = Math.min(1, 64 / Math.max(img.width, img.height));
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('canvas 2d context unavailable')); return; }

      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      const pixels: RGBColor[] = [];
      for (let i = 0; i < data.length; i += 4) {
        pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
      }

      const clusters = kMeansClusters(pixels, k);
      const hexes = clusters.map(rgbToHex);

      // Pick accent: most saturated / vibrant mid-luminance color
      let accentIdx = 0;
      let maxVibrancy = 0;
      for (let i = 0; i < clusters.length; i++) {
        const c = clusters[i];
        const maxCh = Math.max(c.r, c.g, c.b);
        const minCh = Math.min(c.r, c.g, c.b);
        const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
        const lum = luminance(c);
        const vibrancy = sat * (1 - Math.abs(lum - 128) / 128);
        if (vibrancy > maxVibrancy) { maxVibrancy = vibrancy; accentIdx = i; }
      }

      // Darkest color
      const darkIdx = clusters.reduce((best, c, i) =>
        luminance(c) < luminance(clusters[best]) ? i : best, 0);

      // Most muted (lowest saturation)
      const mutedIdx = clusters.reduce((best, c, i) => {
        const maxCh = Math.max(c.r, c.g, c.b);
        const minCh = Math.min(c.r, c.g, c.b);
        const sat = maxCh > 0 ? (maxCh - minCh) / maxCh : 0;
        const bestC = clusters[best];
        const bMax = Math.max(bestC.r, bestC.g, bestC.b);
        const bMin = Math.min(bestC.r, bestC.g, bestC.b);
        const bSat = bMax > 0 ? (bMax - bMin) / bMax : 0;
        return sat < bSat ? i : best;
      }, 0);

      resolve({
        dominant: hexes[0],
        secondary: hexes[1] ?? hexes[0],
        accent: hexes[accentIdx],
        muted: hexes[mutedIdx],
        dark: hexes[darkIdx],
        colors: hexes,
      });
    };
    img.onerror = () => reject(new Error('Failed to load wallpaper image'));
    img.src = imageSrc;
  });
}

// =========================================================================
// CSS VARIABLE INJECTION
// =========================================================================

let activeStyleEl: HTMLStyleElement | null = null;

export function applyWallpaperPalette(palette: WallpaperPalette): void {
  if (activeStyleEl) activeStyleEl.remove();
  activeStyleEl = document.createElement('style');
  activeStyleEl.id = 'dex-wallpaper-palette';
  activeStyleEl.textContent = `
    :root {
      --wallpaper-dominant: ${palette.dominant};
      --wallpaper-secondary: ${palette.secondary};
      --wallpaper-accent: ${palette.accent};
      --wallpaper-muted: ${palette.muted};
      --wallpaper-dark: ${palette.dark};
    }
  `;
  document.head.appendChild(activeStyleEl);
}

// =========================================================================
// WALLPAPER CROSSFADE COMPONENT
// =========================================================================

export const WallpaperLayer: React.FC<{
  src: string;
  onPaletteExtracted?: (palette: WallpaperPalette) => void;
}> = ({ src, onPaletteExtracted }) => {
  const [current, setCurrent] = useState(src);
  const [previous, setPrevious] = useState<string | null>(null);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (src !== current) {
      setPrevious(current);
      setCurrent(src);
      setTransitioning(true);
      const timeout = setTimeout(() => {
        setTransitioning(false);
        setPrevious(null);
      }, isReduceMotion() ? 0 : 500);
      return () => clearTimeout(timeout);
    }
  }, [src]);

  useEffect(() => {
    if (current) {
      extractPalette(current)
        .then(palette => {
          applyWallpaperPalette(palette);
          onPaletteExtracted?.(palette);
        })
        .catch((e: unknown) => { console.warn('[DEX]', e); });
    }
  }, [current]);

  const baseStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    zIndex: -1,
  };

  return (
    <>
      {previous && transitioning && (
        <div
          style={{
            ...baseStyle,
            backgroundImage: `url(${CSS.escape(previous)})`,
            opacity: 1,
            animation: isReduceMotion() ? 'none' : 'wallpaperFadeOut 0.5s ease forwards',
          }}
        />
      )}
      <div
        style={{
          ...baseStyle,
          backgroundImage: `url(${CSS.escape(current)})`,
          opacity: transitioning && !isReduceMotion() ? 0 : 1,
          animation: transitioning && !isReduceMotion() ? 'wallpaperFadeIn 0.5s ease forwards' : 'none',
        }}
      />
    </>
  );
};

// =========================================================================
// DOCK REFLECTION (mix-blend-mode soft-light)
// =========================================================================

export function getDockReflectionStyle(): React.CSSProperties {
  return {
    background: 'var(--wallpaper-dominant, transparent)',
    mixBlendMode: 'soft-light',
    opacity: 0.08,
    position: 'absolute',
    inset: 0,
    borderRadius: 'inherit',
    pointerEvents: 'none',
  };
}
