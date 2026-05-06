// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * Creative Suite Shared Engine (Items 241-260)
 * Shared utilities, effects, and rendering for creative apps
 */

import { useCallback, useEffect, useRef, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface RenderContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  timestamp: number;
  deltaTime: number;
}

export interface EffectParams {
  [key: string]: number | string | boolean;
}

export type EffectFunction = (ctx: CanvasRenderingContext2D, params: EffectParams) => void;

// ============================================================================
// Color Utilities
// ============================================================================

export interface RGB {
  r: number;
  g: number;
  b: number;
}

export interface HSL {
  h: number;
  s: number;
  l: number;
}

export interface CMYK {
  c: number;
  m: number;
  y: number;
  k: number;
}

export function hexToRgb(hex: string): RGB {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsl(r: number, g: number, b: number): HSL {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  h /= 360;
  s /= 100;
  l /= 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
}

export function rgbToCmyk(r: number, g: number, b: number): CMYK {
  const r1 = r / 255;
  const g1 = g / 255;
  const b1 = b / 255;
  const k = 1 - Math.max(r1, g1, b1);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  const c = (1 - r1 - k) / (1 - k);
  const m = (1 - g1 - k) / (1 - k);
  const y = (1 - b1 - k) / (1 - k);
  return { c: c * 100, m: m * 100, y: y * 100, k: k * 100 };
}

export function cmykToRgb(c: number, m: number, y: number, k: number): RGB {
  c /= 100;
  m /= 100;
  y /= 100;
  k /= 100;
  return {
    r: Math.round(255 * (1 - c) * (1 - k)),
    g: Math.round(255 * (1 - m) * (1 - k)),
    b: Math.round(255 * (1 - y) * (1 - k)),
  };
}

// ============================================================================
// Easing Functions
// ============================================================================

export type EasingFunction = (t: number) => number;

export const EASINGS: Record<string, EasingFunction> = {
  linear: t => t,
  easeInQuad: t => t * t,
  easeOutQuad: t => t * (2 - t),
  easeInOutQuad: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeInCubic: t => t * t * t,
  easeOutCubic: t => (--t) * t * t + 1,
  easeInOutCubic: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
  easeInQuart: t => t * t * t * t,
  easeOutQuart: t => 1 - (--t) * t * t * t,
  easeInOutQuart: t => t < 0.5 ? 8 * t * t * t * t : 1 - 8 * (--t) * t * t * t,
  easeInQuint: t => t * t * t * t * t,
  easeOutQuint: t => 1 + (--t) * t * t * t * t,
  easeInOutQuint: t => t < 0.5 ? 16 * t * t * t * t * t : 1 + 16 * (--t) * t * t * t * t,
  easeInSine: t => 1 - Math.cos(t * Math.PI / 2),
  easeOutSine: t => Math.sin(t * Math.PI / 2),
  easeInOutSine: t => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  easeOutExpo: t => t === 1 ? 1 : 1 - Math.pow(2, -10 * t),
  easeInOutExpo: t => t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  easeInCirc: t => 1 - Math.sqrt(1 - t * t),
  easeOutCirc: t => Math.sqrt(1 - (--t) * t),
  easeInOutCirc: t => t < 0.5 ? (1 - Math.sqrt(1 - 4 * t * t)) / 2 : (Math.sqrt(1 - Math.pow(-2 * t + 2, 2)) + 1) / 2,
  easeInElastic: t => t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * (2 * Math.PI) / 3),
  easeOutElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1,
  easeInBack: t => 2.70158 * t * t * t - 1.70158 * t * t,
  easeOutBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  easeInBounce: t => 1 - EASINGS.easeOutBounce(1 - t),
  easeOutBounce: t => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ============================================================================
// Bezier Curves
// ============================================================================

export interface Point2D {
  x: number;
  y: number;
}

export function cubicBezier(p0: Point2D, p1: Point2D, p2: Point2D, p3: Point2D, t: number): Point2D {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  
  return {
    x: mt3 * p0.x + 3 * mt2 * t * p1.x + 3 * mt * t2 * p2.x + t3 * p3.x,
    y: mt3 * p0.y + 3 * mt2 * t * p1.y + 3 * mt * t2 * p2.y + t3 * p3.y,
  };
}

export function quadraticBezier(p0: Point2D, p1: Point2D, p2: Point2D, t: number): Point2D {
  const mt = 1 - t;
  return {
    x: mt * mt * p0.x + 2 * mt * t * p1.x + t * t * p2.x,
    y: mt * mt * p0.y + 2 * mt * t * p1.y + t * t * p2.y,
  };
}

export function bezierLength(points: Point2D[], segments = 100): number {
  let length = 0;
  let prev: Point2D | null = null;
  
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const point = points.length === 3
      ? quadraticBezier(points[0], points[1], points[2], t)
      : cubicBezier(points[0], points[1], points[2], points[3], t);
    
    if (prev) {
      length += Math.hypot(point.x - prev.x, point.y - prev.y);
    }
    prev = point;
  }
  
  return length;
}

// ============================================================================
// Image Processing
// ============================================================================

export function adjustBrightness(imageData: ImageData, amount: number): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + amount));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + amount));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + amount));
  }
  return imageData;
}

export function adjustContrast(imageData: ImageData, amount: number): ImageData {
  const factor = (259 * (amount + 255)) / (255 * (259 - amount));
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
  }
  return imageData;
}

export function adjustSaturation(imageData: ImageData, amount: number): ImageData {
  const data = imageData.data;
  const factor = amount / 100 + 1;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = Math.min(255, Math.max(0, gray + factor * (data[i] - gray)));
    data[i + 1] = Math.min(255, Math.max(0, gray + factor * (data[i + 1] - gray)));
    data[i + 2] = Math.min(255, Math.max(0, gray + factor * (data[i + 2] - gray)));
  }
  return imageData;
}

export function applyGrayscale(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  return imageData;
}

export function applySepia(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    data[i] = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
    data[i + 1] = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
    data[i + 2] = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
  }
  return imageData;
}

export function invertColors(imageData: ImageData): ImageData {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  return imageData;
}

// ============================================================================
// Blur Algorithms
// ============================================================================

export function boxBlur(imageData: ImageData, radius: number): ImageData {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const output = new Uint8ClampedArray(data.length);
  
  const size = radius * 2 + 1;
  const divider = size * size;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          r += data[idx];
          g += data[idx + 1];
          b += data[idx + 2];
          a += data[idx + 3];
        }
      }
      
      const idx = (y * width + x) * 4;
      output[idx] = r / divider;
      output[idx + 1] = g / divider;
      output[idx + 2] = b / divider;
      output[idx + 3] = a / divider;
    }
  }
  
  return new ImageData(output, width, height);
}

// ============================================================================
// Audio Utilities
// ============================================================================

export function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

export function linearToDb(linear: number): number {
  return 20 * Math.log10(Math.max(0.00001, linear));
}

export function frequencyToNote(freq: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const a4 = 440;
  const semitones = 12 * Math.log2(freq / a4);
  const noteNum = Math.round(semitones) + 69;
  const octave = Math.floor(noteNum / 12) - 1;
  const note = noteNum % 12;
  return `${noteNames[note]}${octave}`;
}

export function noteToFrequency(note: string): number {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const match = note.match(/^([A-G]#?)(\d+)$/i);
  if (!match) return 440;
  
  const noteName = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);
  const noteIndex = noteNames.indexOf(noteName);
  if (noteIndex === -1) return 440;
  
  const noteNum = noteIndex + (octave + 1) * 12;
  return 440 * Math.pow(2, (noteNum - 69) / 12);
}

export function bpmToMs(bpm: number, beats: number = 1): number {
  return (60000 / bpm) * beats;
}

export function msToBpm(ms: number, beats: number = 1): number {
  return (60000 * beats) / ms;
}

// ============================================================================
// Timecode Utilities
// ============================================================================

export function secondsToTimecode(seconds: number, fps: number = 30): string {
  const totalFrames = Math.floor(seconds * fps);
  const frames = totalFrames % fps;
  const totalSeconds = Math.floor(totalFrames / fps);
  const secs = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const mins = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  
  return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
}

export function timecodeToSeconds(timecode: string, fps: number = 30): number {
  const parts = timecode.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [hours, mins, secs, frames] = parts;
  return hours * 3600 + mins * 60 + secs + frames / fps;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// ============================================================================
// Canvas Utilities
// ============================================================================

export function createHiDPICanvas(width: number, height: number, dpr?: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const actualDpr = dpr ?? (window.devicePixelRatio || 1);
  canvas.width = width * actualDpr;
  canvas.height = height * actualDpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext('2d');
  ctx?.scale(actualDpr, actualDpr);
  return canvas;
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string, type = 'image/png', quality = 0.92): void {
  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL(type, quality);
  link.click();
}

export async function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/png', quality = 0.92): Promise<Blob | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob), type, quality);
  });
}

// ============================================================================
// Undo/Redo Manager
// ============================================================================

export interface UndoState<T> {
  data: T;
  timestamp: number;
  description: string;
}

export class UndoManager<T> {
  private undoStack: UndoState<T>[] = [];
  private redoStack: UndoState<T>[] = [];
  private maxSize: number;
  
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
  }
  
  push(state: T, description = ''): void {
    this.undoStack.push({
      data: structuredClone(state),
      timestamp: Date.now(),
      description,
    });
    
    if (this.undoStack.length > this.maxSize) {
      this.undoStack.shift();
    }
    
    this.redoStack = [];
  }
  
  undo(): T | null {
    const state = this.undoStack.pop();
    if (!state) return null;
    this.redoStack.push(state);
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].data : null;
  }
  
  redo(): T | null {
    const state = this.redoStack.pop();
    if (!state) return null;
    this.undoStack.push(state);
    return state.data;
  }
  
  canUndo(): boolean {
    return this.undoStack.length > 1;
  }
  
  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
  
  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
  
  getHistory(): UndoState<T>[] {
    return [...this.undoStack];
  }
}

// ============================================================================
// Export Formats
// ============================================================================

export const EXPORT_FORMATS = {
  image: [
    { id: 'png', name: 'PNG', ext: '.png', mime: 'image/png' },
    { id: 'jpeg', name: 'JPEG', ext: '.jpg', mime: 'image/jpeg' },
    { id: 'webp', name: 'WebP', ext: '.webp', mime: 'image/webp' },
    { id: 'gif', name: 'GIF', ext: '.gif', mime: 'image/gif' },
    { id: 'tiff', name: 'TIFF', ext: '.tiff', mime: 'image/tiff' },
    { id: 'bmp', name: 'BMP', ext: '.bmp', mime: 'image/bmp' },
  ],
  video: [
    { id: 'mp4', name: 'MP4 (H.264)', ext: '.mp4', mime: 'video/mp4' },
    { id: 'webm', name: 'WebM (VP9)', ext: '.webm', mime: 'video/webm' },
    { id: 'mov', name: 'QuickTime', ext: '.mov', mime: 'video/quicktime' },
    { id: 'avi', name: 'AVI', ext: '.avi', mime: 'video/x-msvideo' },
  ],
  audio: [
    { id: 'mp3', name: 'MP3', ext: '.mp3', mime: 'audio/mpeg' },
    { id: 'wav', name: 'WAV', ext: '.wav', mime: 'audio/wav' },
    { id: 'aac', name: 'AAC', ext: '.aac', mime: 'audio/aac' },
    { id: 'ogg', name: 'OGG', ext: '.ogg', mime: 'audio/ogg' },
    { id: 'flac', name: 'FLAC', ext: '.flac', mime: 'audio/flac' },
  ],
};

// ============================================================================
// Generate Unique ID
// ============================================================================

export function generateId(prefix = ''): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return prefix ? `${prefix}_${timestamp}_${random}` : `${timestamp}_${random}`;
}
