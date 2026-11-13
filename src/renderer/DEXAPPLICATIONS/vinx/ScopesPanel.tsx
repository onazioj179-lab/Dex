// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * VINX -- Real-time scopes panel
 * Samples a video element each frame and renders waveform / vectorscope /
 * histogram / RGB parade from the actual pixels (no simulated data).
 */

import React, { useEffect, useRef } from 'react';
import { useAppActive } from '../../utils/perfAware';

export type ScopeMode = 'waveform' | 'vectorscope' | 'histogram' | 'parade';

interface Props {
  videoEl: HTMLVideoElement | null;
  mode: ScopeMode;
  height?: number;
}

const SAMPLE_W = 240;
const SAMPLE_H = 135;

export const ScopesPanel: React.FC<Props> = ({ videoEl, mode, height = 200 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sampleCanvas = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const frameToggle = useRef(0);

  // Pause the scope readback when Vinx is backgrounded WITHIN DEX (another app on
  // top). `document.hidden` only covers the whole window being hidden; this covers
  // the in-app foreground/background state. Mirrored to a ref so the long-lived
  // tick closure reads the live value without restarting the loop.
  const isActive = useAppActive(canvasRef);
  const isActiveRef = useRef(isActive);
  useEffect(() => { isActiveRef.current = isActive; }, [isActive]);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    if (!sampleCanvas.current) {
      sampleCanvas.current = document.createElement('canvas');
      sampleCanvas.current.width = SAMPLE_W;
      sampleCanvas.current.height = SAMPLE_H;
    }
    const sCtx = sampleCanvas.current.getContext('2d', { willReadFrequently: true });

    const w = cv.width;
    const h = cv.height;

    const drawNoSignal = () => {
      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(160,160,160,0.7)';
      ctx.font = '11px system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No video signal', w / 2, h / 2);
    };

    const tick = () => {
      // Skip all sampling/drawing while the scopes can't be seen: the window is
      // hidden (minimized / background tab) OR Vinx is backgrounded behind another
      // DEX app. drawImage + getImageData on a video is expensive and pointless when
      // nothing is on screen. rAF stays alive (cheap) so it resumes instantly.
      if (document.hidden || !isActiveRef.current) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      frameToggle.current = (frameToggle.current + 1) % 2;
      // 15fps ~ render every other rAF (~30fps source)
      if (frameToggle.current === 0) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (!videoEl || videoEl.readyState < 2 || videoEl.videoWidth === 0) {
        drawNoSignal();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      try {
        sCtx?.drawImage(videoEl, 0, 0, SAMPLE_W, SAMPLE_H);
      } catch {
        drawNoSignal();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      let img: ImageData | null = null;
      try {
        img = sCtx?.getImageData(0, 0, SAMPLE_W, SAMPLE_H) ?? null;
      } catch {
        // CORS-tainted canvas
        drawNoSignal();
        ctx.fillStyle = 'rgba(255,180,80,0.8)';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText('source restricted', w / 2, h / 2 + 14);
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      if (!img) {
        drawNoSignal();
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      ctx.fillStyle = '#0A0A0A';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(40,40,40,1)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i < 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, h * i / 4); ctx.lineTo(w, h * i / 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w * i / 4, 0); ctx.lineTo(w * i / 4, h); ctx.stroke();
      }

      const data = img.data;

      if (mode === 'waveform') {
        ctx.fillStyle = 'rgba(120,255,140,0.30)';
        const colScale = w / SAMPLE_W;
        for (let y = 0; y < SAMPLE_H; y++) {
          for (let x = 0; x < SAMPLE_W; x++) {
            const idx = (y * SAMPLE_W + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b; // 0..255
            const py = ((255 - luma) / 255) * h;
            ctx.fillRect(x * colScale, py, Math.max(1, colScale), 1);
          }
        }
      } else if (mode === 'vectorscope') {
        const cx = w / 2;
        const cy = h / 2;
        const scale = Math.min(w, h) / 2 - 4;
        ctx.strokeStyle = 'rgba(60,60,60,1)';
        ctx.beginPath(); ctx.arc(cx, cy, scale, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(cx, cy, scale * 0.5, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = 'rgba(120,255,140,0.20)';
        // Subsample
        for (let i = 0; i < data.length; i += 16) { // every 4th pixel
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // BT.601 YCbCr
          const cb = -0.168736 * r - 0.331264 * g + 0.5 * b; // -128..128
          const cr = 0.5 * r - 0.418688 * g - 0.081312 * b;
          const px = cx + (cb / 128) * scale;
          const py = cy - (cr / 128) * scale;
          ctx.fillRect(px, py, 1, 1);
        }
      } else if (mode === 'parade') {
        // RGB parade: one waveform per channel, side by side (R | G | B).
        const third = w / 3;
        const colScale = third / SAMPLE_W;
        const fills = ['rgba(255,90,90,0.30)', 'rgba(90,230,120,0.30)', 'rgba(90,150,255,0.30)'];
        for (let c = 0; c < 3; c++) {
          ctx.fillStyle = fills[c];
          const x0 = c * third;
          for (let y = 0; y < SAMPLE_H; y++) {
            for (let x = 0; x < SAMPLE_W; x++) {
              const v = data[(y * SAMPLE_W + x) * 4 + c];
              ctx.fillRect(x0 + x * colScale, ((255 - v) / 255) * h, Math.max(1, colScale), 1);
            }
          }
        }
        ctx.strokeStyle = 'rgba(70,70,70,1)';
        for (let c = 1; c < 3; c++) { ctx.beginPath(); ctx.moveTo(c * third, 0); ctx.lineTo(c * third, h); ctx.stroke(); }
      } else {
        // histogram
        const rB = new Uint32Array(256);
        const gB = new Uint32Array(256);
        const bB = new Uint32Array(256);
        for (let i = 0; i < data.length; i += 4) {
          rB[data[i]]++; gB[data[i + 1]]++; bB[data[i + 2]]++;
        }
        let max = 1;
        for (let i = 0; i < 256; i++) {
          if (rB[i] > max) max = rB[i];
          if (gB[i] > max) max = gB[i];
          if (bB[i] > max) max = bB[i];
        }
        const bw = w / 256;
        for (let i = 0; i < 256; i++) {
          const x = i * bw;
          const rh = (rB[i] / max) * h * 0.95;
          const gh = (gB[i] / max) * h * 0.95;
          const bh = (bB[i] / max) * h * 0.95;
          ctx.fillStyle = 'rgba(255,80,80,0.6)';
          ctx.fillRect(x, h - rh, Math.max(1, bw), rh);
          ctx.fillStyle = 'rgba(80,220,120,0.6)';
          ctx.fillRect(x, h - gh, Math.max(1, bw), gh);
          ctx.fillStyle = 'rgba(80,140,255,0.6)';
          ctx.fillRect(x, h - bh, Math.max(1, bw), bh);
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [videoEl, mode]);

  return (
    <canvas
      ref={canvasRef}
      width={320}
      height={height}
      style={{
        width: '100%', height,
        background: '#0A0A0A',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 4, display: 'block',
      }}
    />
  );
};

ScopesPanel.displayName = 'VinxScopesPanel';

export default ScopesPanel;
