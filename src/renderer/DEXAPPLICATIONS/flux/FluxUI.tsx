// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - FLUX Animation UI Components
// Professional motion graphics interface
// Items 526-550 of the 1000-item improvement plan
// =============================================================================

import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';

// =============================================================================
// SVG ICONS
// =============================================================================

const Icons = {
  // Transport controls
  play: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M8 5v14l11-7L8 5z"/>
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
    </svg>
  ),
  stop: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <rect x="6" y="6" width="12" height="12"/>
    </svg>
  ),
  skipBack: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M11 18V6l-7 6 7 6zm2 0V6l7 6-7 6zm-8-6V4h2v14H5v-6z"/>
    </svg>
  ),
  skipForward: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M13 6v12l7-6-7-6zm-2 0v12l-7-6 7-6zm8 6v6h-2V4h2v8z"/>
    </svg>
  ),
  stepBack: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M18 6l-6 6 6 6V6zm-6 0H8v12h4V6z"/>
    </svg>
  ),
  stepForward: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M6 18l6-6-6-6v12zm6 0h4V6h-4v12z"/>
    </svg>
  ),
  
  // Layer icons
  solid: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <rect x="4" y="4" width="16" height="16" rx="2"/>
    </svg>
  ),
  text: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M5 5h14v3h-5v11h-4V8H5V5z"/>
    </svg>
  ),
  shape: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <polygon points="12,2 22,20 2,20"/>
    </svg>
  ),
  camera: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/>
    </svg>
  ),
  null: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>
      <path d="M12 7v5l4 2"/>
    </svg>
  ),
  adjustment: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"/>
    </svg>
  ),
  image: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
    </svg>
  ),
  composition: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>
    </svg>
  ),
  
  // Timeline icons
  keyframe: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
      <path d="M12 2L4 12l8 10 8-10L12 2z"/>
    </svg>
  ),
  keyframeFilled: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
      <path d="M12 2L4 12l8 10 8-10L12 2z"/>
    </svg>
  ),
  
  // Tool icons
  selection: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M7 2l10 10-3 1 2 5-2 1-2-5-3 2L7 2z"/>
    </svg>
  ),
  hand: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M18 11V5c0-.55-.45-1-1-1s-1 .45-1 1v5h-1V3c0-.55-.45-1-1-1s-1 .45-1 1v7h-1V4c0-.55-.45-1-1-1s-1 .45-1 1v6H9V6c0-.55-.45-1-1-1s-1 .45-1 1v8.59c-1.68-1.23-2.33-1.45-2.71-1.45-.33 0-.67.14-.92.39l-.84.83c.21.26 2.32 2.93 4.34 5.18.53.6 1.3.96 2.13.96H17c1.65 0 3-1.35 3-3v-6c0-.55-.45-1-1-1s-1 .45-1 1z"/>
    </svg>
  ),
  zoom: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
      <path d="M12 10h-2v2H8v-2H6V8h2V6h2v2h2v2z"/>
    </svg>
  ),
  rotate: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M7.11 8.53L5.7 7.11C4.8 8.27 4.24 9.61 4.07 11h2.02c.14-.87.49-1.72 1.02-2.47zM6.09 13H4.07c.17 1.39.72 2.73 1.62 3.89l1.41-1.42c-.52-.75-.87-1.59-1.01-2.47zm1.01 5.32c1.16.9 2.51 1.44 3.9 1.61V17.9c-.87-.15-1.71-.49-2.46-1.03L7.1 18.32zM13 4.07V1L8.45 5.55 13 10V6.09c2.84.48 5 2.94 5 5.91s-2.16 5.43-5 5.91v2.02c3.95-.49 7-3.85 7-7.93s-3.05-7.44-7-7.93z"/>
    </svg>
  ),
  pen: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
    </svg>
  ),
  
  // Property icons
  expand: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
      <path d="M7 10l5 5 5-5H7z"/>
    </svg>
  ),
  collapse: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12">
      <path d="M10 17l5-5-5-5v10z"/>
    </svg>
  ),
  visible: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  ),
  hidden: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  ),
  lock: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/>
    </svg>
  ),
  solo: (
    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
      <circle cx="12" cy="12" r="8"/>
    </svg>
  )
};

// =============================================================================
// ITEM 526-530: COMPOSITION VIEWER
// =============================================================================

interface CompositionViewerProps {
  width: number;
  height: number;
  frame: number;
  zoom: number;
  imageData?: ImageData;
  guides?: { type: 'h' | 'v'; position: number }[];
  safeArea?: boolean;
  grid?: boolean;
  onZoomChange?: (zoom: number) => void;
}

export const CompositionViewer: React.FC<CompositionViewerProps> = ({
  width,
  height,
  frame,
  zoom,
  imageData,
  guides = [],
  safeArea = false,
  grid = false,
  onZoomChange
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw composition background
    const compWidth = width * zoom;
    const compHeight = height * zoom;
    const offsetX = (canvas.width - compWidth) / 2 + pan.x;
    const offsetY = (canvas.height - compHeight) / 2 + pan.y;
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(offsetX, offsetY, compWidth, compHeight);
    
    // Draw image data
    if (imageData) {
      const tempCanvas = new OffscreenCanvas(width, height);
      const tempCtx = tempCanvas.getContext('2d');
      if (tempCtx) {
        tempCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(tempCanvas, offsetX, offsetY, compWidth, compHeight);
      }
    }
    
    // Draw grid
    if (grid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.lineWidth = 1;
      
      const gridSize = 50 * zoom;
      for (let x = offsetX; x < offsetX + compWidth; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + compHeight);
        ctx.stroke();
      }
      for (let y = offsetY; y < offsetY + compHeight; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + compWidth, y);
        ctx.stroke();
      }
    }
    
    // Draw safe area
    if (safeArea) {
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      
      // Action safe (90%)
      const actionInset = 0.05;
      ctx.strokeRect(
        offsetX + compWidth * actionInset,
        offsetY + compHeight * actionInset,
        compWidth * (1 - actionInset * 2),
        compHeight * (1 - actionInset * 2)
      );
      
      // Title safe (80%)
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
      const titleInset = 0.1;
      ctx.strokeRect(
        offsetX + compWidth * titleInset,
        offsetY + compHeight * titleInset,
        compWidth * (1 - titleInset * 2),
        compHeight * (1 - titleInset * 2)
      );
      
      ctx.setLineDash([]);
    }
    
    // Draw guides
    ctx.strokeStyle = 'rgba(0, 150, 255, 0.8)';
    ctx.lineWidth = 1;
    
    for (const guide of guides) {
      ctx.beginPath();
      if (guide.type === 'h') {
        const y = offsetY + guide.position * zoom;
        ctx.moveTo(offsetX, y);
        ctx.lineTo(offsetX + compWidth, y);
      } else {
        const x = offsetX + guide.position * zoom;
        ctx.moveTo(x, offsetY);
        ctx.lineTo(x, offsetY + compHeight);
      }
      ctx.stroke();
    }
  }, [width, height, zoom, imageData, pan, guides, safeArea, grid]);
  
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(4, zoom * delta));
      onZoomChange?.(newZoom);
    }
  }, [zoom, onZoomChange]);
  
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setIsPanning(true);
    }
  }, []);
  
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setPan(p => ({
        x: p.x + e.movementX,
        y: p.y + e.movementY
      }));
    }
  }, [isPanning]);
  
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  return (
    <div
      ref={containerRef}
      className="composition-viewer"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#1a1a1a'
      }}
    >
      <canvas
        ref={canvasRef}
        width={800}
        height={450}
        style={{ width: '100%', height: '100%', cursor: isPanning ? 'grabbing' : 'default' }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      />
      
      {/* Info bar */}
      <div style={{
        position: 'absolute',
        bottom: 8,
        left: 8,
        fontSize: 11,
        color: '#888',
        background: 'rgba(0,0,0,0.6)',
        padding: '2px 6px',
        borderRadius: 3
      }}>
        {width} x {height} | Frame {frame} | {Math.round(zoom * 100)}%
      </div>
    </div>
  );
};

// =============================================================================
// ITEM 531-535: TIMELINE COMPONENT
// =============================================================================

interface TimelineLayer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  solo: boolean;
  expanded: boolean;
  inPoint: number;
  outPoint: number;
  keyframes: { property: string; times: number[] }[];
}

interface TimelineProps {
  layers: TimelineLayer[];
  currentTime: number;
  duration: number;
  fps: number;
  workArea: { start: number; end: number };
  onTimeChange?: (time: number) => void;
  onLayerSelect?: (layerId: string) => void;
  onLayerToggle?: (layerId: string, property: 'visible' | 'locked' | 'solo') => void;
}

export const Timeline: React.FC<TimelineProps> = ({
  layers,
  currentTime,
  duration,
  fps,
  workArea,
  onTimeChange,
  onLayerSelect,
  onLayerToggle
}) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [scroll, setScroll] = useState(0);
  
  const framesPerSecond = fps;
  const totalFrames = Math.round(duration * framesPerSecond);
  const pixelsPerFrame = 10 * scale;
  
  const formatTime = (frames: number): string => {
    const secs = Math.floor(frames / framesPerSecond);
    const f = Math.floor(frames % framesPerSecond);
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };
  
  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left + scroll;
    const frame = Math.round(x / pixelsPerFrame);
    onTimeChange?.(Math.max(0, Math.min(totalFrames, frame)));
  }, [scroll, pixelsPerFrame, totalFrames, onTimeChange]);
  
  const handleScroll = useCallback((e: React.WheelEvent) => {
    if (e.shiftKey) {
      setScale(s => Math.max(0.5, Math.min(4, s + (e.deltaY > 0 ? -0.1 : 0.1))));
    } else {
      setScroll(s => Math.max(0, s + e.deltaX));
    }
  }, []);
  
  const getLayerIcon = (type: string) => {
    switch (type) {
      case 'solid': return Icons.solid;
      case 'text': return Icons.text;
      case 'shape': return Icons.shape;
      case 'camera': return Icons.camera;
      case 'light': return Icons.light;
      case 'null': return Icons.null;
      case 'adjustment': return Icons.adjustment;
      case 'image': return Icons.image;
      case 'composition': return Icons.composition;
      default: return Icons.solid;
    }
  };
  
  return (
    <div className="timeline" style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#252526',
      color: '#ccc',
      fontSize: 12
    }}>
      {/* Timeline header */}
      <div style={{
        display: 'flex',
        height: 24,
        borderBottom: '1px solid #3c3c3c'
      }}>
        <div style={{ width: 250, borderRight: '1px solid #3c3c3c', padding: '4px 8px' }}>
          Layers
        </div>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Time ruler */}
          <svg width="100%" height="100%" style={{ position: 'absolute' }}>
            {Array.from({ length: Math.ceil(totalFrames / framesPerSecond) + 1 }).map((_, i) => {
              const x = i * framesPerSecond * pixelsPerFrame - scroll;
              return (
                <g key={i}>
                  <line x1={x} y1="16" x2={x} y2="24" stroke="#666" strokeWidth="1" />
                  <text x={x + 3} y="12" fill="#888" fontSize="9">
                    {formatTime(i * framesPerSecond)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      
      {/* Layers */}
      <div style={{ flex: 1, overflow: 'auto' }} onWheel={handleScroll}>
        {layers.map(layer => (
          <div
            key={layer.id}
            style={{
              display: 'flex',
              height: 28,
              borderBottom: '1px solid #3c3c3c',
              alignItems: 'center'
            }}
          >
            {/* Layer info */}
            <div
              style={{
                width: 250,
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '0 8px',
                borderRight: '1px solid #3c3c3c'
              }}
              onClick={() => onLayerSelect?.(layer.id)}
            >
              <button
                style={{ background: 'none', border: 'none', color: layer.expanded ? '#fff' : '#666', cursor: 'pointer', padding: 2 }}
              >
                {layer.expanded ? Icons.expand : Icons.collapse}
              </button>
              <span style={{ color: '#569cd6' }}>{getLayerIcon(layer.type)}</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {layer.name}
              </span>
              <button
                style={{ background: 'none', border: 'none', color: layer.visible ? '#fff' : '#666', cursor: 'pointer', padding: 2 }}
                onClick={(e) => { e.stopPropagation(); onLayerToggle?.(layer.id, 'visible'); }}
              >
                {layer.visible ? Icons.visible : Icons.hidden}
              </button>
              <button
                style={{ background: 'none', border: 'none', color: layer.solo ? '#f9a825' : '#666', cursor: 'pointer', padding: 2 }}
                onClick={(e) => { e.stopPropagation(); onLayerToggle?.(layer.id, 'solo'); }}
              >
                {Icons.solo}
              </button>
              <button
                style={{ background: 'none', border: 'none', color: layer.locked ? '#f44' : '#666', cursor: 'pointer', padding: 2 }}
                onClick={(e) => { e.stopPropagation(); onLayerToggle?.(layer.id, 'locked'); }}
              >
                {Icons.lock}
              </button>
            </div>
            
            {/* Timeline bars */}
            <div
              style={{ flex: 1, position: 'relative', height: '100%' }}
              onClick={handleTimelineClick}
            >
              {/* Layer bar */}
              <div
                style={{
                  position: 'absolute',
                  left: layer.inPoint * pixelsPerFrame - scroll,
                  width: (layer.outPoint - layer.inPoint) * pixelsPerFrame,
                  height: 20,
                  top: 4,
                  background: '#4a4a8a',
                  borderRadius: 3
                }}
              />
              
              {/* Keyframes */}
              {layer.keyframes.map(prop => 
                prop.times.map((time, i) => (
                  <div
                    key={`${prop.property}-${i}`}
                    style={{
                      position: 'absolute',
                      left: time * pixelsPerFrame - scroll - 5,
                      top: 8,
                      color: '#f9a825'
                    }}
                  >
                    {Icons.keyframe}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
      
      {/* Current time indicator */}
      <div
        style={{
          position: 'absolute',
          left: 250 + currentTime * pixelsPerFrame - scroll,
          top: 0,
          bottom: 0,
          width: 1,
          background: '#f44',
          pointerEvents: 'none',
          zIndex: 10
        }}
      />
    </div>
  );
};

// =============================================================================
// ITEM 536-540: TRANSPORT CONTROLS
// =============================================================================

interface TransportControlsProps {
  currentTime: number;
  duration: number;
  fps: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onGoToStart: () => void;
  onGoToEnd: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onTimeChange: (time: number) => void;
}

export const TransportControls: React.FC<TransportControlsProps> = ({
  currentTime,
  duration,
  fps,
  isPlaying,
  onPlay,
  onPause,
  onStop,
  onGoToStart,
  onGoToEnd,
  onStepBack,
  onStepForward,
  onTimeChange
}) => {
  const formatTimecode = (frames: number): string => {
    const totalSeconds = frames / fps;
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const f = Math.floor(frames % fps);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  };
  
  return (
    <div className="transport-controls" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 12px',
      background: '#2d2d2d',
      borderRadius: 4
    }}>
      <button
        onClick={onGoToStart}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        title="Go to Start (Home)"
      >
        {Icons.skipBack}
      </button>
      
      <button
        onClick={onStepBack}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        title="Previous Frame (Page Up)"
      >
        {Icons.stepBack}
      </button>
      
      <button
        onClick={isPlaying ? onPause : onPlay}
        style={{
          background: '#4a4a8a',
          border: 'none',
          color: '#fff',
          cursor: 'pointer',
          padding: 8,
          borderRadius: 4
        }}
        title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
      >
        {isPlaying ? Icons.pause : Icons.play}
      </button>
      
      <button
        onClick={onStop}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        title="Stop"
      >
        {Icons.stop}
      </button>
      
      <button
        onClick={onStepForward}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        title="Next Frame (Page Down)"
      >
        {Icons.stepForward}
      </button>
      
      <button
        onClick={onGoToEnd}
        style={{
          background: 'none',
          border: 'none',
          color: '#ccc',
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4
        }}
        title="Go to End (End)"
      >
        {Icons.skipForward}
      </button>
      
      <div style={{
        marginLeft: 12,
        fontFamily: 'monospace',
        fontSize: 14,
        color: 'var(--color-text-primary)',
        background: 'var(--color-bg-input)',
        padding: '4px 8px',
        borderRadius: 3
      }}>
        {formatTimecode(currentTime)}
      </div>
      
      <input
        type="number"
        value={currentTime}
        onChange={(e) => onTimeChange(Math.max(0, Math.min(duration * fps, parseInt(e.target.value) || 0)))}
        style={{
          width: 60,
          background: 'var(--color-bg-input)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text-primary)',
          padding: '4px 8px',
          borderRadius: 3,
          fontFamily: 'monospace',
          fontSize: 12
        }}
        min={0}
        max={Math.round(duration * fps)}
      />
      
      <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>
        / {formatTimecode(Math.round(duration * fps))}
      </span>
    </div>
  );
};

// =============================================================================
// ITEM 541-545: PROPERTY PANEL
// =============================================================================

interface PropertyValue {
  value: unknown;
  hasKeyframes: boolean;
  isAnimated: boolean;
}

interface PropertyGroup {
  name: string;
  expanded: boolean;
  properties: { name: string; value: PropertyValue; type: string }[];
}

interface PropertyPanelProps {
  layerName: string;
  layerType: string;
  groups: PropertyGroup[];
  onPropertyChange?: (groupName: string, propertyName: string, value: unknown) => void;
  onToggleKeyframe?: (groupName: string, propertyName: string) => void;
  onToggleGroup?: (groupName: string) => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  layerName,
  layerType,
  groups,
  onPropertyChange,
  onToggleKeyframe,
  onToggleGroup
}) => {
  const renderPropertyInput = (prop: { name: string; value: PropertyValue; type: string }, groupName: string) => {
    const { value } = prop.value;
    
    switch (prop.type) {
      case 'number':
        return (
          <input
            type="number"
            value={value as number}
            onChange={(e) => onPropertyChange?.(groupName, prop.name, parseFloat(e.target.value))}
            style={{
              width: 60,
              background: 'var(--color-bg-input)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-primary)',
              padding: '2px 4px',
              borderRadius: 2,
              fontSize: 11
            }}
          />
        );
      
      case 'point':
        const point = value as { x: number; y: number };
        return (
          <div style={{ display: 'flex', gap: 4 }}>
            <input
              type="number"
              value={point.x}
              onChange={(e) => onPropertyChange?.(groupName, prop.name, { ...point, x: parseFloat(e.target.value) })}
              style={{ width: 50, background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '2px 4px', borderRadius: 2, fontSize: 11 }}
            />
            <input
              type="number"
              value={point.y}
              onChange={(e) => onPropertyChange?.(groupName, prop.name, { ...point, y: parseFloat(e.target.value) })}
              style={{ width: 50, background: 'var(--color-bg-input)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)', padding: '2px 4px', borderRadius: 2, fontSize: 11 }}
            />
          </div>
        );
      
      case 'color':
        return (
          <input
            type="color"
            value={value as string}
            onChange={(e) => onPropertyChange?.(groupName, prop.name, e.target.value)}
            style={{ width: 60, height: 20, padding: 0, border: 'none', cursor: 'pointer' }}
          />
        );
      
      case 'checkbox':
        return (
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(e) => onPropertyChange?.(groupName, prop.name, e.target.checked)}
            style={{ cursor: 'pointer' }}
          />
        );
      
      default:
        return <span>{String(value)}</span>;
    }
  };
  
  return (
    <div className="property-panel" style={{
      background: '#252526',
      color: '#ccc',
      fontSize: 11,
      height: '100%',
      overflow: 'auto'
    }}>
      {/* Header */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #3c3c3c',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <span style={{ color: '#569cd6' }}>
          {layerType === 'text' ? Icons.text : 
           layerType === 'shape' ? Icons.shape : 
           layerType === 'solid' ? Icons.solid : Icons.solid}
        </span>
        <span style={{ fontWeight: 500 }}>{layerName}</span>
      </div>
      
      {/* Property groups */}
      {groups.map(group => (
        <div key={group.name}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '6px 12px',
              background: '#2d2d30',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={() => onToggleGroup?.(group.name)}
          >
            <span style={{ marginRight: 4 }}>
              {group.expanded ? Icons.expand : Icons.collapse}
            </span>
            <span>{group.name}</span>
          </div>
          
          {group.expanded && (
            <div style={{ padding: '4px 0' }}>
              {group.properties.map(prop => (
                <div
                  key={prop.name}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '4px 12px 4px 24px',
                    gap: 8
                  }}
                >
                  <button
                    onClick={() => onToggleKeyframe?.(group.name, prop.name)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: prop.value.hasKeyframes ? '#f9a825' : '#666',
                      cursor: 'pointer',
                      padding: 0
                    }}
                  >
                    {Icons.keyframe}
                  </button>
                  <span style={{ width: 80, color: prop.value.isAnimated ? '#f9a825' : '#ccc' }}>
                    {prop.name}
                  </span>
                  {renderPropertyInput(prop, group.name)}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// =============================================================================
// ITEM 546-550: TOOLBAR & TOOLS
// =============================================================================

type Tool = 'selection' | 'hand' | 'zoom' | 'rotate' | 'pen' | 'text' | 'shape';

interface ToolbarProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  activeTool,
  onToolChange
}) => {
  const tools: { id: Tool; icon: JSX.Element; label: string; shortcut: string }[] = [
    { id: 'selection', icon: Icons.selection, label: 'Selection Tool', shortcut: 'V' },
    { id: 'hand', icon: Icons.hand, label: 'Hand Tool', shortcut: 'H' },
    { id: 'zoom', icon: Icons.zoom, label: 'Zoom Tool', shortcut: 'Z' },
    { id: 'rotate', icon: Icons.rotate, label: 'Rotation Tool', shortcut: 'W' },
    { id: 'pen', icon: Icons.pen, label: 'Pen Tool', shortcut: 'G' },
    { id: 'text', icon: Icons.text, label: 'Text Tool', shortcut: 'Ctrl+T' },
    { id: 'shape', icon: Icons.shape, label: 'Shape Tool', shortcut: 'Q' }
  ];
  
  return (
    <div className="toolbar" style={{
      display: 'flex',
      flexDirection: 'column',
      gap: 2,
      padding: 4,
      background: '#252526',
      borderRight: '1px solid #3c3c3c'
    }}>
      {tools.map(tool => (
        <button
          key={tool.id}
          onClick={() => onToolChange(tool.id)}
          title={`${tool.label} (${tool.shortcut})`}
          style={{
            background: activeTool === tool.id ? '#37373d' : 'transparent',
            border: 'none',
            color: activeTool === tool.id ? '#fff' : '#999',
            cursor: 'pointer',
            padding: 8,
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          {tool.icon}
        </button>
      ))}
    </div>
  );
};

// Layer creation panel
interface LayerCreatorProps {
  onCreateLayer: (type: string, options?: Record<string, unknown>) => void;
}

export const LayerCreator: React.FC<LayerCreatorProps> = ({ onCreateLayer }) => {
  const layerTypes = [
    { id: 'solid', icon: Icons.solid, label: 'Solid' },
    { id: 'text', icon: Icons.text, label: 'Text' },
    { id: 'shape', icon: Icons.shape, label: 'Shape' },
    { id: 'null', icon: Icons.null, label: 'Null Object' },
    { id: 'adjustment', icon: Icons.adjustment, label: 'Adjustment Layer' },
    { id: 'camera', icon: Icons.camera, label: 'Camera' },
    { id: 'light', icon: Icons.light, label: 'Light' }
  ];
  
  return (
    <div className="layer-creator" style={{
      display: 'flex',
      gap: 4,
      padding: '4px 8px',
      background: '#2d2d2d',
      borderRadius: 4
    }}>
      {layerTypes.map(type => (
        <button
          key={type.id}
          onClick={() => onCreateLayer(type.id)}
          title={`New ${type.label}`}
          style={{
            background: 'transparent',
            border: '1px solid #3c3c3c',
            color: '#ccc',
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11
          }}
        >
          {type.icon}
          <span>{type.label}</span>
        </button>
      ))}
    </div>
  );
};

// Keyframe interpolation selector
interface KeyframeInterpolationProps {
  currentType: string;
  onTypeChange: (type: string) => void;
}

export const KeyframeInterpolation: React.FC<KeyframeInterpolationProps> = ({
  currentType,
  onTypeChange
}) => {
  const types = [
    { id: 'linear', label: 'Linear' },
    { id: 'hold', label: 'Hold' },
    { id: 'bezier', label: 'Bezier' },
    { id: 'easeIn', label: 'Easy Ease In' },
    { id: 'easeOut', label: 'Easy Ease Out' },
    { id: 'easeInOut', label: 'Easy Ease' }
  ];
  
  return (
    <select
      value={currentType}
      onChange={(e) => onTypeChange(e.target.value)}
      style={{
        background: 'var(--color-bg-input)',
        border: '1px solid var(--color-border)',
        color: 'var(--color-text-primary)',
        padding: '4px 8px',
        borderRadius: 3,
        fontSize: 11
      }}
    >
      {types.map(type => (
        <option key={type.id} value={type.id}>{type.label}</option>
      ))}
    </select>
  );
};

// =============================================================================
// EXPORTS
// =============================================================================

export {
  Icons
};

export default {
  CompositionViewer,
  Timeline,
  TransportControls,
  PropertyPanel,
  Toolbar,
  LayerCreator,
  KeyframeInterpolation
};
