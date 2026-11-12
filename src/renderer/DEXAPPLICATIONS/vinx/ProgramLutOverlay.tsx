// =============================================================================
// DEX Platform — VINX program monitor 3D LUT overlay
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// When a .cube LUT is loaded, this canvas sits over the program monitor and
// redraws the visible clips through the LUT every frame (WebGL2; a reduced-size
// CPU path otherwise), using the same contain-fit compositing as Quick Export
// so what you see is what is exported. It runs only while a cube is active and
// the window is visible.

import React, { useEffect, useRef } from 'react';
import { LutRenderer } from './lutGL';
import type { Lut3D } from './lut3d';

/** Draw every visible, ready <video> under `host` contain-fit onto ctx. */
export function compositeVideos(ctx: CanvasRenderingContext2D, host: ParentNode, w: number, h: number): void {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  host.querySelectorAll('video').forEach((v) => {
    if (v.style.display === 'none' || v.readyState < 2 || v.videoWidth === 0) return;
    const s = Math.min(w / v.videoWidth, h / v.videoHeight);
    const dw = v.videoWidth * s, dh = v.videoHeight * s;
    try { ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh); } catch { /* tainted frame */ }
  });
}

export const ProgramLutOverlay: React.FC<{ cube: Lut3D; intensity: number; width: number; height: number }> = ({ cube, intensity, width, height }) => {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const host = anchorRef.current?.parentElement;
    if (!host) return;
    // A fresh canvas per run: a WebGL context released on cleanup cannot be reused.
    const out = document.createElement('canvas');
    out.setAttribute('data-vinx-lut-overlay', '');
    out.setAttribute('aria-hidden', 'true');
    Object.assign(out.style, { position: 'absolute', inset: '0', width: `${width}px`, height: `${height}px`, pointerEvents: 'none', zIndex: '1' });
    host.appendChild(out);
    const renderer = new LutRenderer(out);
    renderer.setLut(cube);
    const scratch = document.createElement('canvas');
    const sctx = scratch.getContext('2d');
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (document.hidden || !sctx) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // The CPU path grades every pixel in JS: keep it to ~640 px wide.
      const scale = renderer.gpu ? dpr : Math.min(dpr, 640 / Math.max(1, width));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (scratch.width !== w) scratch.width = w;
      if (scratch.height !== h) scratch.height = h;
      compositeVideos(sctx, host, w, h);
      renderer.render(scratch, w, h, intensityRef.current);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); renderer.dispose(); out.remove(); };
  }, [cube, width, height]);

  return <span ref={anchorRef} hidden />;
};
