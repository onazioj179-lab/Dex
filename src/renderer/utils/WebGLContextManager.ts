// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX -- WebGL Context Manager
 * Handles WebGL context loss/restoration gracefully to prevent
 * blank canvases and GPU-related renderer crashes.
 */

export interface WebGLContextDescriptor {
  canvas: HTMLCanvasElement;
  gl: WebGLRenderingContext | WebGL2RenderingContext | null;
  reinitialize: () => void;
  isLost: boolean;
  _handleLost?: EventListener;
  _handleRestored?: EventListener;
}

type ContextEventCallback = (descriptor: WebGLContextDescriptor) => void;

const managedContexts = new Map<HTMLCanvasElement, WebGLContextDescriptor>();
const listeners = new Map<string, Set<ContextEventCallback>>();

function emit(event: string, desc: WebGLContextDescriptor): void {
  const set = listeners.get(event);
  if (set) {
    set.forEach(fn => { try { fn(desc); } catch { /* silent */ } });
  }
}

/**
 * Create a managed WebGL context that automatically handles context loss.
 * @param canvas The canvas element
 * @param contextType 'webgl' or 'webgl2'
 * @param attributes WebGL context attributes
 * @param reinitializeCallback Called when context is restored. Must recreate all GL resources.
 * @returns The WebGL context descriptor, or null if WebGL is unavailable
 */
export function createManagedContext(
  canvas: HTMLCanvasElement,
  contextType: 'webgl' | 'webgl2' = 'webgl2',
  attributes: WebGLContextAttributes = {},
  reinitializeCallback: (gl: WebGLRenderingContext | WebGL2RenderingContext) => void = () => {},
): WebGLContextDescriptor | null {
  const gl = canvas.getContext(contextType, {
    powerPreference: 'high-performance',
    desynchronized: true,
    ...attributes,
  }) as WebGLRenderingContext | WebGL2RenderingContext | null;

  if (!gl) {
    return null;
  }

  const descriptor: WebGLContextDescriptor = {
    canvas,
    gl,
    reinitialize: () => {},
    isLost: false,
  };

  const handleLost = (event: Event): void => {
    event.preventDefault();
    descriptor.isLost = true;
    descriptor.gl = null;
    emit('context-lost', descriptor);
  };

  const handleRestored = (): void => {
    const newGl = canvas.getContext(contextType, {
      powerPreference: 'high-performance',
      desynchronized: true,
      ...attributes,
    }) as WebGLRenderingContext | WebGL2RenderingContext | null;

    if (newGl) {
      descriptor.gl = newGl;
      descriptor.isLost = false;
      reinitializeCallback(newGl);
      emit('context-restored', descriptor);
    }
  };

  descriptor.reinitialize = handleRestored;
  descriptor._handleLost = handleLost as EventListener;
  descriptor._handleRestored = handleRestored as unknown as EventListener;

  canvas.addEventListener('webglcontextlost', handleLost);
  canvas.addEventListener('webglcontextrestored', handleRestored);

  managedContexts.set(canvas, descriptor);

  return descriptor;
}

/**
 * Release a managed context and remove event listeners.
 */
export function releaseContext(canvas: HTMLCanvasElement): void {
  const descriptor = managedContexts.get(canvas);
  if (descriptor) {
    if (descriptor._handleLost) canvas.removeEventListener('webglcontextlost', descriptor._handleLost);
    if (descriptor._handleRestored) canvas.removeEventListener('webglcontextrestored', descriptor._handleRestored);
  }
  managedContexts.delete(canvas);
}

/**
 * Get a Canvas2D context with null-safety fallback.
 * If getContext('2d') returns null, the canvas element is replaced
 * with a plain colored div of the same dimensions.
 */
export function getSafe2DContext(
  canvas: HTMLCanvasElement,
  fallbackColor: string = '#121215',
): CanvasRenderingContext2D | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const parent = canvas.parentElement;
    if (parent) {
      const fallback = document.createElement('div');
      fallback.style.width = `${canvas.width}px`;
      fallback.style.height = `${canvas.height}px`;
      fallback.style.backgroundColor = fallbackColor;
      fallback.style.borderRadius = '8px';
      parent.replaceChild(fallback, canvas);
    }
    return null;
  }
  return ctx;
}

/**
 * Listen for context events across all managed canvases.
 */
export function onContextEvent(event: 'context-lost' | 'context-restored', callback: ContextEventCallback): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(callback);
  return () => { listeners.get(event)?.delete(callback); };
}

/**
 * Get count of active managed contexts.
 */
export function getManagedContextCount(): number {
  return managedContexts.size;
}
