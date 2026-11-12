// =============================================================================
// DEX Platform — VINX 3D LUT on the GPU
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Draws an image source through a 3D LUT with WebGL2: the table is a
// TEXTURE_3D with LINEAR filtering (hardware trilinear, same math as
// lut3d.sampleLut), sampled at texel centres so the ends of the domain map to
// the first and last entries. Falls back to the CPU path when WebGL2 or float
// textures are unavailable.

import { applyLutToPixels, type Lut3D } from './lut3d';

const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = vec2(p.x*0.5+0.5, 0.5-p.y*0.5); gl_Position = vec4(p,0.,1.); }`;

const FS = `#version 300 es
precision highp float; precision highp sampler3D;
in vec2 uv; out vec4 o;
uniform sampler2D src; uniform sampler3D lut;
uniform float size; uniform float k; uniform vec3 dmin; uniform vec3 dmax;
void main(){
  vec4 c = texture(src, uv);
  vec3 t = clamp((mix(dmin, dmax, c.rgb) - dmin) / (dmax - dmin), 0., 1.);
  vec3 coord = t * ((size - 1.) / size) + 0.5 / size;
  vec3 g = texture(lut, coord).rgb;
  o = vec4(mix(c.rgb, g, k), c.a);
}`;

export class LutRenderer {
  readonly canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private srcTex: WebGLTexture | null = null;
  private lutTex: WebGLTexture | null = null;
  private lut: Lut3D | null = null;
  private ctx2d: CanvasRenderingContext2D | null = null;
  /** True when frames go through WebGL2; false = CPU fallback (slower). */
  readonly gpu: boolean;

  constructor(canvas: HTMLCanvasElement = document.createElement('canvas')) {
    this.canvas = canvas;
    this.gpu = this.initGL();
    if (!this.gpu) this.ctx2d = canvas.getContext('2d', { willReadFrequently: true });
  }

  private initGL(): boolean {
    try {
      const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: false, preserveDrawingBuffer: true });
      if (!gl) return false;
      const sh = (type: number, src: string) => {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
        return s;
      };
      const prog = gl.createProgram()!;
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.srcTex = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
      for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, p, v);
      this.lutTex = gl.createTexture();
      gl.uniform1i(gl.getUniformLocation(prog, 'src'), 0);
      gl.uniform1i(gl.getUniformLocation(prog, 'lut'), 1);
      this.gl = gl;
      this.prog = prog;
      return true;
    } catch {
      return false;
    }
  }

  setLut(lut: Lut3D): void {
    this.lut = lut;
    const gl = this.gl;
    if (!gl || !this.prog) return;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    // RGB16F is filterable in WebGL2 without extensions (RGB32F is not).
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, lut.size, lut.size, lut.size, 0, gl.RGB, gl.FLOAT, lut.data);
    for (const [p, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_3D, p, v);
    gl.uniform1f(gl.getUniformLocation(this.prog, 'size'), lut.size);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'dmin'), lut.domainMin);
    gl.uniform3fv(gl.getUniformLocation(this.prog, 'dmax'), lut.domainMax);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** Grade `source` (w×h) into this.canvas. Returns false if it could not. */
  render(source: TexImageSource | HTMLCanvasElement, w: number, h: number, intensity = 1): boolean {
    if (!this.lut || w <= 0 || h <= 0) return false;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    const gl = this.gl;
    if (gl && this.prog) {
      try {
        gl.viewport(0, 0, w, h);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.uniform1f(gl.getUniformLocation(this.prog, 'k'), Math.min(1, Math.max(0, intensity)));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        return true;
      } catch { return false; }
    }
    const c = this.ctx2d;
    if (!c) return false;
    try {
      c.drawImage(source as CanvasImageSource, 0, 0, w, h);
      const img = c.getImageData(0, 0, w, h);
      applyLutToPixels(this.lut, img.data, intensity);
      c.putImageData(img, 0, 0);
      return true;
    } catch { return false; }
  }

  dispose(): void {
    const gl = this.gl;
    if (gl) {
      if (this.srcTex) gl.deleteTexture(this.srcTex);
      if (this.lutTex) gl.deleteTexture(this.lutTex);
      if (this.prog) gl.deleteProgram(this.prog);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.gl = null;
    this.prog = null;
  }
}
