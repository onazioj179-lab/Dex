// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
import { useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode, type RefObject } from 'react';
import DexIcon from '../components/DexIcon';
import { clampCamera, DEFAULT_SPATIAL_CAMERA, fitSpatialWindows, MAX_SPATIAL_SCALE, MIN_SPATIAL_SCALE, zoomAt, type SpatialCamera } from './spatialGeometry';

const CAMERA_KEY = 'dex-spatial-camera';

function readCamera(): SpatialCamera {
  try {
    const value = JSON.parse(localStorage.getItem(CAMERA_KEY) ?? 'null');
    if (value && [value.scale, value.x, value.y].every(Number.isFinite)) return value;
  } catch { /* Use the default view when storage is unavailable. */ }
  return DEFAULT_SPATIAL_CAMERA;
}

interface Props {
  active: boolean;
  viewportRef: RefObject<HTMLDivElement>;
  onExit: () => void;
  hasOpenWindows?: boolean;
  children: ReactNode;
}

export function SpatialWorkspace({ active, viewportRef, onExit, hasOpenWindows = false, children }: Props) {
  const layer = useRef<HTMLDivElement>(null);
  const [initialCamera] = useState(readCamera);
  const camera = useRef(initialCamera);
  const viewportSize = useRef({ width: 0, height: 0 });
  const frame = useRef(0);
  const saveTimer = useRef(0);
  const pan = useRef<{ pointerId: number; startX: number; startY: number; camera: SpatialCamera } | null>(null);
  const [panMode, setPanMode] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(() => Math.round(camera.current.scale * 100));

  const store = () => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = 0;
    try { localStorage.setItem(CAMERA_KEY, JSON.stringify(camera.current)); } catch { /* View changes still apply. */ }
  };
  const paint = () => {
    frame.current = 0;
    const element = layer.current;
    if (!element) return;
    const { x, y, scale } = camera.current;
    element.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    element.style.setProperty('--dex-camera-inverse', `translate(${-x / scale}px, ${-y / scale}px) scale(${1 / scale})`);
    element.dataset.spatialScale = String(scale);
    setZoomPercent(Math.round(scale * 100));
  };
  const moveCamera = (next: SpatialCamera) => {
    camera.current = clampCamera(next, viewportSize.current);
    if (!frame.current) frame.current = requestAnimationFrame(paint);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(store, 200);
  };
  const windowMoving = () => !!layer.current?.querySelector('[data-dragging="true"]');
  const changeZoom = (factor: number) => {
    if (pan.current || windowMoving()) return;
    const size = viewportSize.current;
    moveCamera(zoomAt(camera.current, camera.current.scale * factor, { x: size.width / 2, y: size.height / 2 }, size));
  };
  const fitOpenWindows = () => {
    const element = layer.current;
    if (!element || pan.current || windowMoving()) return;
    const origin = element.getBoundingClientRect();
    const scale = Number(element.dataset.spatialScale) || 1;
    const windows = Array.from(element.querySelectorAll<HTMLElement>('[data-floating-window]'))
      .map(window => window.getBoundingClientRect())
      .filter(bounds => bounds.width > 0 && bounds.height > 0)
      .map(bounds => ({
        x: (bounds.left - origin.left) / scale,
        y: (bounds.top - origin.top) / scale,
        w: bounds.width / scale,
        h: bounds.height / scale,
      }));
    const next = fitSpatialWindows(windows, viewportSize.current);
    if (next) moveCamera(next);
  };
  const togglePan = () => {
    pan.current = null;
    setPanMode(value => !value);
  };

  useLayoutEffect(() => {
    const element = layer.current;
    const surface = viewportRef.current;
    if (!element || !surface) return;
    if (!active) {
      element.style.removeProperty('transform');
      element.style.removeProperty('--dex-camera-inverse');
      delete element.dataset.spatialScale;
      pan.current = null;
      setPanMode(false);
      return;
    }
    const fit = () => {
      viewportSize.current = { width: surface.clientWidth, height: surface.clientHeight };
      camera.current = clampCamera(camera.current, viewportSize.current);
      paint();
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.altKey || event.deltaY === 0) return;
      event.preventDefault();
      if (pan.current || windowMoving()) return;
      const rect = surface.getBoundingClientRect();
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 100 : 1);
      const scale = camera.current.scale * Math.exp(-delta * 0.003);
      moveCamera(zoomAt(camera.current, scale, { x: event.clientX - rect.left, y: event.clientY - rect.top }, viewportSize.current));
    };
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(surface);
    surface.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      observer?.disconnect();
      surface.removeEventListener('wheel', onWheel);
      cancelAnimationFrame(frame.current);
      frame.current = 0;
      if (saveTimer.current) store();
    };
  }, [active, viewportRef]);

  const startPan = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || pan.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pan.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, camera: camera.current };
  };
  const endPan = (event: PointerEvent<HTMLDivElement>) => {
    if (pan.current?.pointerId === event.pointerId) pan.current = null;
  };

  return (
    <div ref={viewportRef} id="dex-main-content" role="main" aria-label="App content" className="dex-workspace-viewport">
      <div ref={layer} className="dex-workspace-layer">{children}</div>
      {active && <>
        {panMode && <div className="dex-spatial-pan" data-dex-overlay aria-hidden="true"
          onPointerDown={startPan}
          onPointerMove={(event) => {
            const start = pan.current;
            if (start?.pointerId !== event.pointerId) return;
            moveCamera({ ...start.camera, x: start.camera.x + event.clientX - start.startX, y: start.camera.y + event.clientY - start.startY });
          }}
          onPointerUp={endPan} onPointerCancel={endPan} onLostPointerCapture={endPan} />}
        <div className="dex-spatial-controls" data-dex-overlay role="group" aria-label="Spatial workspace controls"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              event.stopPropagation();
              if (panMode) togglePan();
              else onExit();
              return;
            }
            const delta = { ArrowLeft: [64, 0], ArrowRight: [-64, 0], ArrowUp: [0, 64], ArrowDown: [0, -64] }[event.key];
            if (!delta || pan.current || windowMoving()) return;
            event.preventDefault();
            event.stopPropagation();
            moveCamera({ ...camera.current, x: camera.current.x + delta[0], y: camera.current.y + delta[1] });
          }}>
          <button type="button" aria-label="Zoom out" title="Zoom out" disabled={zoomPercent <= MIN_SPATIAL_SCALE * 100} onClick={() => changeZoom(1 / 1.15)}><DexIcon name="minus" size={15} /></button>
          <button type="button" className="dex-spatial-zoom" aria-label={`Reset view, current zoom ${zoomPercent}%`} title="Reset view" onClick={() => { if (!pan.current && !windowMoving()) moveCamera({ scale: 1, x: 0, y: 0 }); }}>{zoomPercent}%</button>
          <button type="button" aria-label="Zoom in" title="Zoom in" disabled={zoomPercent >= MAX_SPATIAL_SCALE * 100} onClick={() => changeZoom(1.15)}><DexIcon name="plus" size={15} /></button>
          <span className="dex-spatial-divider" aria-hidden="true" />
          <button type="button" aria-label="Pan workspace" aria-pressed={panMode} title="Pan workspace with drag or arrow keys" onClick={togglePan}><DexIcon name="hand" size={16} /></button>
          <button type="button" aria-label="Fit open windows" title="Fit open windows" disabled={!hasOpenWindows} onClick={fitOpenWindows}><DexIcon name="maximize" size={15} /></button>
          <button type="button" aria-label="Exit spatial view" title="Exit spatial view" onClick={onExit}><DexIcon name="close" size={16} /></button>
        </div>
      </>}
    </div>
  );
}
