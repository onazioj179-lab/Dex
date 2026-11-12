/**
 * Flux shader layers: real GLSL fragment shaders.
 *
 * The Shader Effects panel had a GLSL editor whose code was never compiled
 * ("Compile & Apply" added CSS filters instead). A layer with `shader` now runs
 * the fragment shader in an offscreen WebGL canvas every frame and draws the
 * result. Compile errors are returned verbatim from the GPU driver.
 *
 * Uniforms available to the shader:
 *   float u_time        seconds since the layer's in-point × speed
 *   vec2  u_resolution  output size in px
 *   float u_intensity   0..1
 *   vec3  u_color       0..1 RGB
 */

export interface ShaderSpec { code: string; speed: number; intensity: number; color: string }

const VERTEX = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;

export function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return [1, 1, 1];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

/** Add `precision` when the user's code has none (WebGL1 fragment shaders require it). */
export function withPrecision(code: string): string {
  return /\bprecision\s+(lowp|mediump|highp)\s+float\s*;/.test(code) ? code : `precision mediump float;\n${code}`;
}

interface Compiled { gl: WebGLRenderingContext; program: WebGLProgram; canvas: HTMLCanvasElement | OffscreenCanvas; code: string }

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | string {
  const sh = gl.createShader(type);
  if (!sh) return 'The GPU refused to create a shader.';
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || 'Unknown compile error.';
    gl.deleteShader(sh);
    return log.trim();
  }
  return sh;
}

/** One WebGL context per shader layer, reused across frames. */
export class ShaderRenderer {
  private compiled: Compiled | null = null;
  lastError: string | null = null;

  /** Compile `code`; returns null on success or the compile/link log. */
  compile(code: string): string | null {
    if (this.compiled?.code === code) return null;
    this.dispose();
    const canvas: HTMLCanvasElement | OffscreenCanvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(2, 2) : document.createElement('canvas');
    const gl = (canvas as HTMLCanvasElement).getContext('webgl', { preserveDrawingBuffer: true, premultipliedAlpha: false }) as WebGLRenderingContext | null;
    if (!gl) return (this.lastError = 'WebGL is not available on this device.');
    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, withPrecision(code));
    if (typeof vs === 'string') return (this.lastError = vs);
    if (typeof fs === 'string') return (this.lastError = fs);
    const program = gl.createProgram();
    if (!program) return (this.lastError = 'The GPU refused to create a program.');
    gl.attachShader(program, vs); gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return (this.lastError = (gl.getProgramInfoLog(program) || 'Link failed.').trim());
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.compiled = { gl, program, canvas, code };
    this.lastError = null;
    return null;
  }

  /** Render a frame; returns the canvas to draw, or null when not compiled. */
  render(spec: ShaderSpec, width: number, height: number, seconds: number): HTMLCanvasElement | OffscreenCanvas | null {
    if (this.compile(spec.code)) return null;
    const c = this.compiled!;
    const { gl, program, canvas } = c;
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    gl.viewport(0, 0, width, height);
    gl.useProgram(program);
    const u = (n: string) => gl.getUniformLocation(program, n);
    gl.uniform1f(u('u_time'), seconds * spec.speed);
    gl.uniform2f(u('u_resolution'), width, height);
    gl.uniform1f(u('u_intensity'), spec.intensity);
    const [r, g, b] = hexToRgb01(spec.color);
    gl.uniform3f(u('u_color'), r, g, b);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    return canvas;
  }

  dispose(): void {
    if (!this.compiled) return;
    this.compiled.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.compiled = null;
  }
}

/** Shader renderers keyed by layer id; drop the ones whose layer is gone. */
export class ShaderPool {
  private map = new Map<string, ShaderRenderer>();
  get(id: string): ShaderRenderer {
    let r = this.map.get(id);
    if (!r) { r = new ShaderRenderer(); this.map.set(id, r); }
    return r;
  }
  prune(liveIds: Set<string>): void {
    for (const [id, r] of this.map) if (!liveIds.has(id)) { r.dispose(); this.map.delete(id); }
  }
}

/** Starting points loaded into the editor (all use only the uniforms above). */
export const SHADER_PRESETS: Array<{ name: string; code: string }> = [
  { name: 'Colour cycle', code: `uniform float u_time;\nuniform vec2 u_resolution;\nuniform float u_intensity;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  vec3 col = 0.5 + 0.5 * cos(u_time + uv.xyx + vec3(0.0, 2.0, 4.0));\n  gl_FragColor = vec4(mix(vec3(0.0), col, 0.4 + 0.6 * u_intensity), 1.0);\n}` },
  { name: 'Plasma', code: `uniform float u_time;\nuniform vec2 u_resolution;\nuniform vec3 u_color;\n\nvoid main() {\n  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;\n  float v = sin(p.x * 3.0 + u_time) + sin(p.y * 4.0 - u_time * 1.3) + sin(length(p) * 6.0 - u_time * 2.0);\n  gl_FragColor = vec4(u_color * (0.5 + 0.25 * v), 1.0);\n}` },
  { name: 'Rings', code: `uniform float u_time;\nuniform vec2 u_resolution;\nuniform vec3 u_color;\nuniform float u_intensity;\n\nvoid main() {\n  vec2 p = (gl_FragCoord.xy * 2.0 - u_resolution) / u_resolution.y;\n  float r = length(p);\n  float ring = smoothstep(0.45, 0.5, fract(r * 6.0 - u_time * 0.5));\n  gl_FragColor = vec4(u_color * ring * (0.3 + 0.7 * u_intensity), 1.0);\n}` },
  { name: 'Film grain', code: `uniform float u_time;\nuniform vec2 u_resolution;\nuniform float u_intensity;\n\nfloat hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }\n\nvoid main() {\n  float n = hash(gl_FragCoord.xy + floor(u_time * 24.0));\n  gl_FragColor = vec4(vec3(n), 0.08 + 0.3 * u_intensity);\n}` },
  { name: 'CRT scanlines', code: `uniform vec2 u_resolution;\nuniform float u_intensity;\n\nvoid main() {\n  vec2 uv = gl_FragCoord.xy / u_resolution;\n  float line = 0.5 + 0.5 * sin(gl_FragCoord.y * 3.14159);\n  float vig = smoothstep(0.9, 0.3, distance(uv, vec2(0.5)));\n  gl_FragColor = vec4(0.0, 0.0, 0.0, (1.0 - line) * 0.35 * (0.3 + u_intensity) + (1.0 - vig) * 0.5);\n}` },
];
