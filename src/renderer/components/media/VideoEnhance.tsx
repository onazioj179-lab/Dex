// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
//
// Real-time video upscaling for DEX's own players.
//
// A WebGL2 canvas over a <video> redraws every decoded frame at the screen's
// real pixel size: GPU bilinear resampling to the output size, then
// contrast-adaptive sharpening (the CAS idea from AMD FidelityFX, MIT): each
// pixel is sharpened against its source-texel neighbours, more where local
// contrast is low and less near strong edges, so detail comes back without
// halos. It only runs when the video is smaller than where it is shown, honours
// object-fit: contain, and switches itself off if the frame cannot be read
// (cross-origin video) so playback never breaks.

import React, { useEffect, useRef } from 'react';

/** Below this upscale factor there is nothing to recover; draw nothing. */
export const MIN_UPSCALE = 1.15;

export function containRect(vw: number, vh: number, bw: number, bh: number): { x: number; y: number; w: number; h: number } {
  if (vw <= 0 || vh <= 0 || bw <= 0 || bh <= 0) return { x: 0, y: 0, w: 0, h: 0 };
  const s = Math.min(bw / vw, bh / vh);
  const w = vw * s, h = vh * s;
  return { x: (bw - w) / 2, y: (bh - h) / 2, w, h };
}

/** The factor the video is enlarged by on screen (in device pixels). */
export function upscaleFactor(vw: number, vh: number, boxW: number, boxH: number, dpr: number): number {
  const r = containRect(vw, vh, boxW, boxH);
  return vw > 0 ? (r.w * dpr) / vw : 0;
}

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;

// Bilinear sample at the output pixel, then CAS-style adaptive sharpening
// against the four source-texel neighbours.
const FS = `#version 300 es
precision highp float;
in vec2 uv; out vec4 o;
uniform sampler2D tex; uniform vec2 texel; uniform float sharp;
void main() {
  vec3 c = texture(tex, uv).rgb;
  vec3 n = texture(tex, uv + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(tex, uv + vec2(0.0,  texel.y)).rgb;
  vec3 w = texture(tex, uv + vec2(-texel.x, 0.0)).rgb;
  vec3 e = texture(tex, uv + vec2( texel.x, 0.0)).rgb;
  vec3 mn = min(c, min(min(n, s), min(w, e)));
  vec3 mx = max(c, max(max(n, s), max(w, e)));
  vec3 amp = sqrt(clamp(min(mn, 1.0 - mx) / max(mx, 1e-4), 0.0, 1.0));
  vec3 wgt = -amp / mix(8.0, 5.0, sharp);
  vec3 res = (c + (n + s + w + e) * wgt) / (1.0 + 4.0 * wgt);
  o = vec4(clamp(res, 0.0, 1.0), 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
  const sh = gl.createShader(type);
  if (!sh) return null;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null;
}

export interface VideoEnhanceProps {
  video: React.RefObject<HTMLVideoElement>;
  enabled: boolean;
  /** 0 = gentle, 1 = strongest sharpening. */
  sharpness?: number;
  /** Told when enhancement is actually drawing (false: not needed / unavailable). */
  onActiveChange?: (active: boolean) => void;
}

export const VideoEnhance: React.FC<VideoEnhanceProps> = ({ video, enabled, sharpness = 0.6, onActiveChange }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(false);

  useEffect(() => {
    const v = video.current;
    const canvas = canvasRef.current;
    if (!enabled || !v || !canvas) { canvas && (canvas.style.visibility = 'hidden'); return; }
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false });
    if (!gl) return;
    const prog = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FS);
    if (!prog || !vs || !fs) return;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const uTexel = gl.getUniformLocation(prog, 'texel');
    const uSharp = gl.getUniformLocation(prog, 'sharp');

    let stopped = false;
    let handle = 0;
    const setActive = (on: boolean) => {
      if (activeRef.current === on) return;
      activeRef.current = on;
      canvas.style.visibility = on ? 'visible' : 'hidden';
      onActiveChange?.(on);
    };

    const draw = () => {
      if (stopped) return;
      const box = v.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh || upscaleFactor(vw, vh, box.width, box.height, dpr) < MIN_UPSCALE) { setActive(false); return schedule(); }
      const r = containRect(vw, vh, box.width, box.height);
      const cw = Math.round(r.w * dpr), ch = Math.round(r.h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      canvas.style.left = `${r.x}px`; canvas.style.top = `${r.y}px`;
      canvas.style.width = `${r.w}px`; canvas.style.height = `${r.h}px`;
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      } catch {
        // Cross-origin frame: the GPU may not read it. Plain video it is.
        stopped = true;
        setActive(false);
        return;
      }
      gl.viewport(0, 0, cw, ch);
      gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.uniform2f(uTexel, 1 / vw, 1 / vh);
      gl.uniform1f(uSharp, sharpness);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      setActive(true);
      schedule();
    };
    // One draw per decoded frame (no work while paused); rAF where the
    // per-frame callback is unavailable.
    const schedule = () => {
      if (stopped) return;
      const rvfc = (v as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback;
      handle = rvfc ? rvfc.call(v, draw) : requestAnimationFrame(draw);
    };
    const redrawOnResize = () => { if (v.paused) draw(); };
    window.addEventListener('resize', redrawOnResize);
    v.addEventListener('seeked', redrawOnResize);
    v.addEventListener('loadeddata', redrawOnResize);
    draw();

    return () => {
      stopped = true;
      const cancel = (v as HTMLVideoElement & { cancelVideoFrameCallback?: (h: number) => void }).cancelVideoFrameCallback;
      if (cancel) cancel.call(v, handle); else cancelAnimationFrame(handle);
      window.removeEventListener('resize', redrawOnResize);
      v.removeEventListener('seeked', redrawOnResize);
      v.removeEventListener('loadeddata', redrawOnResize);
      gl.deleteTexture(tex); gl.deleteBuffer(buf); gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
      setActive(false);
    };
  }, [video, enabled, sharpness, onActiveChange]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none', visibility: 'hidden' }}
    />
  );
};

export default VideoEnhance;
