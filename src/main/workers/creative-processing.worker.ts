// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX Worker -- Creative App Processing Thread
// ==========================================================================
// Offloads heavy computations from creative apps:
// - Image processing (Prism)
// - Audio waveform generation (Imosion)
// - Video frame extraction (Vinx)
// - Motion graphics rendering (Flux)
// - Batch encoding (Forge)
// - CAD geometry computation (Axl)
// ==========================================================================

import { parentPort, workerData } from 'worker_threads';

interface ThreadMessage {
  type: string;
  payload: any;
  requestId: string;
  timestamp: number;
}

// Optional dependency loading
let sharp: any;
try { sharp = require('sharp'); } catch { sharp = null; }

function respond(msg: ThreadMessage, payload: any, error?: string): void {
  parentPort?.postMessage({
    type: `${msg.type}:response`,
    payload,
    requestId: msg.requestId,
    timestamp: Date.now(),
    error,
  });
}

function heartbeat(): void {
  parentPort?.postMessage({ type: 'heartbeat', payload: null, requestId: 'hb', timestamp: Date.now() });
}

// Heartbeat every 5s
setInterval(heartbeat, 5000);

// ============================================================================
// Image Processing (Prism)
// ============================================================================

interface ImageFilterPayload {
  imageData: Uint8ClampedArray;
  width: number;
  height: number;
  filter: string;
  params?: Record<string, number>;
}

function applyImageFilter(data: Uint8ClampedArray, width: number, height: number, filter: string, params: Record<string, number> = {}): Uint8ClampedArray {
  const result = new Uint8ClampedArray(data);
  const len = data.length;

  switch (filter) {
    case 'grayscale':
      for (let i = 0; i < len; i += 4) {
        const avg = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
        result[i] = result[i + 1] = result[i + 2] = avg;
      }
      break;

    case 'brightness': {
      const val = params.value ?? 0;
      for (let i = 0; i < len; i += 4) {
        result[i] = Math.max(0, Math.min(255, data[i] + val));
        result[i + 1] = Math.max(0, Math.min(255, data[i + 1] + val));
        result[i + 2] = Math.max(0, Math.min(255, data[i + 2] + val));
      }
      break;
    }

    case 'contrast': {
      const factor = (params.value ?? 1) * 2.55;
      const f = (259 * (factor + 255)) / (255 * (259 - factor));
      for (let i = 0; i < len; i += 4) {
        result[i] = Math.max(0, Math.min(255, f * (data[i] - 128) + 128));
        result[i + 1] = Math.max(0, Math.min(255, f * (data[i + 1] - 128) + 128));
        result[i + 2] = Math.max(0, Math.min(255, f * (data[i + 2] - 128) + 128));
      }
      break;
    }

    case 'invert':
      for (let i = 0; i < len; i += 4) {
        result[i] = 255 - data[i];
        result[i + 1] = 255 - data[i + 1];
        result[i + 2] = 255 - data[i + 2];
      }
      break;

    case 'sepia':
      for (let i = 0; i < len; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        result[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
        result[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
        result[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
      }
      break;

    case 'blur': {
      const radius = params.radius ?? 3;
      // Simple box blur for performance
      const kernel = Math.pow(radius * 2 + 1, 2);
      const tempResult = new Uint8ClampedArray(data);
      for (let y = radius; y < height - radius; y++) {
        for (let x = radius; x < width - radius; x++) {
          let r = 0, g = 0, b = 0;
          for (let ky = -radius; ky <= radius; ky++) {
            for (let kx = -radius; kx <= radius; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              r += data[idx];
              g += data[idx + 1];
              b += data[idx + 2];
            }
          }
          const idx = (y * width + x) * 4;
          tempResult[idx] = r / kernel;
          tempResult[idx + 1] = g / kernel;
          tempResult[idx + 2] = b / kernel;
        }
      }
      return tempResult;
    }

    case 'sharpen': {
      const strength = params.strength ?? 1;
      const kernel = [-strength, -strength, -strength, -strength, 8 * strength + 1, -strength, -strength, -strength, -strength];
      const tempResult = new Uint8ClampedArray(data);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0, g = 0, b = 0, ki = 0;
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              r += data[idx] * kernel[ki];
              g += data[idx + 1] * kernel[ki];
              b += data[idx + 2] * kernel[ki];
              ki++;
            }
          }
          const idx = (y * width + x) * 4;
          tempResult[idx] = Math.max(0, Math.min(255, r));
          tempResult[idx + 1] = Math.max(0, Math.min(255, g));
          tempResult[idx + 2] = Math.max(0, Math.min(255, b));
        }
      }
      return tempResult;
    }
  }

  return result;
}

// ============================================================================
// Audio Processing (Imosion)
// ============================================================================

interface WaveformPayload {
  samples: Float32Array;
  width: number;
  height: number;
}

function generateWaveform(samples: Float32Array, width: number, height: number): number[] {
  const peaks: number[] = [];
  const samplesPerPixel = Math.ceil(samples.length / width);
  const halfHeight = height / 2;

  for (let i = 0; i < width; i++) {
    let min = 1.0, max = -1.0;
    const start = i * samplesPerPixel;
    const end = Math.min(start + samplesPerPixel, samples.length);
    for (let j = start; j < end; j++) {
      const sample = samples[j];
      if (sample < min) min = sample;
      if (sample > max) max = sample;
    }
    peaks.push(Math.round((1 - max) * halfHeight));
    peaks.push(Math.round((1 - min) * halfHeight));
  }

  return peaks;
}

// ============================================================================
// Keyframe Interpolation (Flux)
// ============================================================================

interface KeyframePayload {
  keyframes: Array<{ time: number; value: number; easing: string }>;
  startFrame: number;
  endFrame: number;
  fps: number;
}

function interpolateKeyframes(keyframes: Array<{ time: number; value: number; easing: string }>, start: number, end: number, fps: number): number[] {
  const values: number[] = [];
  const sorted = [...keyframes].sort((a, b) => a.time - b.time);

  for (let frame = start; frame <= end; frame++) {
    const t = frame / fps;
    
    // Find surrounding keyframes
    let prev = sorted[0];
    let next = sorted[sorted.length - 1];
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].time / fps <= t && sorted[i + 1].time / fps >= t) {
        prev = sorted[i];
        next = sorted[i + 1];
        break;
      }
    }

    if (prev === next || prev.time === next.time) {
      values.push(prev.value);
      continue;
    }

    // Interpolate
    const localT = (t - prev.time / fps) / (next.time / fps - prev.time / fps);
    let easedT = localT;

    switch (prev.easing) {
      case 'ease-in': easedT = localT * localT; break;
      case 'ease-out': easedT = 1 - Math.pow(1 - localT, 2); break;
      case 'ease-in-out': easedT = localT < 0.5 ? 2 * localT * localT : 1 - Math.pow(-2 * localT + 2, 2) / 2; break;
      case 'spring': easedT = 1 - Math.exp(-10 * localT) * Math.cos(2 * Math.PI * 0.7 * localT); break;
    }

    values.push(prev.value + (next.value - prev.value) * easedT);
  }

  return values;
}

// ============================================================================
// Geometry Processing (Axl)
// ============================================================================

interface TransformPayload {
  vertices: Float32Array;
  matrix: number[];
}

function transformVertices(vertices: Float32Array, matrix: number[]): Float32Array {
  const result = new Float32Array(vertices.length);
  const m = matrix;

  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i], y = vertices[i + 1], z = vertices[i + 2];
    result[i] = m[0] * x + m[4] * y + m[8] * z + m[12];
    result[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    result[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }

  return result;
}

// ============================================================================
// Message Handler
// ============================================================================

parentPort?.on('message', async (msg: ThreadMessage) => {
  try {
    switch (msg.type) {
      case 'heartbeat':
        heartbeat();
        break;

      case 'apply-image-filter': {
        const { imageData, width, height, filter, params } = msg.payload as ImageFilterPayload;
        const data = new Uint8ClampedArray(imageData);
        const result = applyImageFilter(data, width, height, filter, params);
        respond(msg, { data: Array.from(result), width, height });
        break;
      }

      case 'generate-waveform': {
        const { samples, width, height } = msg.payload as WaveformPayload;
        const data = new Float32Array(samples);
        const peaks = generateWaveform(data, width, height);
        respond(msg, { peaks });
        break;
      }

      case 'interpolate-keyframes': {
        const { keyframes, startFrame, endFrame, fps } = msg.payload as KeyframePayload;
        const values = interpolateKeyframes(keyframes, startFrame, endFrame, fps);
        respond(msg, { values });
        break;
      }

      case 'transform-vertices': {
        const { vertices, matrix } = msg.payload as TransformPayload;
        const data = new Float32Array(vertices);
        const result = transformVertices(data, matrix);
        respond(msg, { vertices: Array.from(result) });
        break;
      }

      case 'batch-process': {
        const { operations } = msg.payload;
        const results: any[] = [];
        for (const op of operations) {
          // Process each operation sequentially
          if (op.type === 'filter') {
            const data = new Uint8ClampedArray(op.imageData);
            const result = applyImageFilter(data, op.width, op.height, op.filter, op.params);
            results.push({ type: 'filter', data: Array.from(result) });
          }
        }
        respond(msg, { results });
        break;
      }

      default:
        respond(msg, null, `Unknown message type: ${msg.type}`);
    }
  } catch (err: any) {
    respond(msg, null, err.message || 'Worker error');
  }
});

// Initial ready
parentPort?.postMessage({ type: 'ready', payload: { threadName: workerData?.threadName }, requestId: 'init', timestamp: Date.now() });
