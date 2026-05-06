// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX v3.7.3 - PRISM UI/UX Polish System
// Professional UI components rivaling Adobe Photoshop/Affinity Photo
// Items 126-150 of the 1000-item improvement plan
// =============================================================================

import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import {
  IconLayers as LayersIcon,
  IconBrush as BrushIcon,
  IconRectSelect as SelectionIcon,
  IconMove as TransformIcon,
  IconEyedropper as EyedropperIcon,
  IconZoomIn as ZoomIcon,
  IconHand as PanIcon,
  IconUndo as UndoIcon,
  IconRedo as RedoIcon,
  IconSave as SaveIcon,
  IconExport as ExportIcon,
  IconSettings as SettingsIcon,
  IconGrid as GridIcon,
  IconSnap as MagnetIcon,
  IconGuides as GuidesIcon,
  IconLevels as HistogramIcon,
  IconColorWheel as ColorWheelIcon,
  IconSwatches as SwatchesIcon,
  IconGradient as PaletteIcon,
  IconCrop as NavigatorIcon,
  IconInfo as InfoIcon
} from '../../components/icons/CreativeIcons';

// =============================================================================
// TYPES
// =============================================================================

interface Tool {
  id: string;
  name: string;
  shortcut: string;
  icon: React.FC<{ className?: string }>;
  subTools?: Tool[];
}

interface PanelConfig {
  id: string;
  title: string;
  icon: React.FC<{ className?: string }>;
  position: 'left' | 'right';
  defaultOpen: boolean;
  minWidth: number;
  maxWidth: number;
}

interface ColorStop {
  position: number;
  color: string;
}

interface WorkspaceLayout {
  id: string;
  name: string;
  panels: {
    left: string[];
    right: string[];
  };
  toolbarVisible: boolean;
  rulerVisible: boolean;
}

// =============================================================================
// ITEM 126: ADAPTIVE TOOLBAR
// =============================================================================

interface ToolbarProps {
  currentTool: string;
  onToolChange: (toolId: string) => void;
  tools: Tool[];
  orientation?: 'horizontal' | 'vertical';
}

export const AdaptiveToolbar = memo(function AdaptiveToolbar({
  currentTool,
  onToolChange,
  tools,
  orientation = 'vertical'
}: ToolbarProps) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [recentTools, setRecentTools] = useState<string[]>([]);
  
  const handleToolClick = useCallback((tool: Tool) => {
    if (tool.subTools && tool.subTools.length > 0) {
      setExpandedTool(expandedTool === tool.id ? null : tool.id);
    } else {
      onToolChange(tool.id);
      setRecentTools(prev => {
        const updated = [tool.id, ...prev.filter(t => t !== tool.id)].slice(0, 5);
        return updated;
      });
    }
  }, [expandedTool, onToolChange]);
  
  const isVertical = orientation === 'vertical';
  
  return (
    <div 
      className={`
        adaptive-toolbar
        ${isVertical ? 'flex-col w-12' : 'flex-row h-12'}
        flex bg-neutral-900 border-neutral-700
        ${isVertical ? 'border-r' : 'border-b'}
      `}
      role="toolbar"
      aria-label="Tools"
    >
      {tools.map(tool => (
        <div key={tool.id} className="relative">
          <button
            className={`
              w-10 h-10 m-1 flex items-center justify-center rounded
              transition-colors duration-150
              ${currentTool === tool.id 
                ? 'bg-blue-600 text-white' 
                : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}
              ${tool.subTools && tool.subTools.length > 0 ? 'pr-2' : ''}
            `}
            onClick={() => handleToolClick(tool)}
            title={`${tool.name} (${tool.shortcut})`}
            aria-pressed={currentTool === tool.id}
          >
            <tool.icon className="w-5 h-5" />
            {tool.subTools && tool.subTools.length > 0 && (
              <svg className="w-2 h-2 absolute bottom-1 right-1" viewBox="0 0 8 8">
                <path d="M0 0L8 0L4 6Z" fill="currentColor" />
              </svg>
            )}
          </button>
          
          {expandedTool === tool.id && tool.subTools && (
            <div 
              className={`
                absolute z-50 bg-neutral-900 border border-neutral-700 rounded shadow-xl
                ${isVertical ? 'left-full top-0 ml-1' : 'top-full left-0 mt-1'}
                flex ${isVertical ? 'flex-col' : 'flex-row'}
              `}
            >
              {tool.subTools.map(subTool => (
                <button
                  key={subTool.id}
                  className={`
                    w-10 h-10 m-1 flex items-center justify-center rounded
                    transition-colors duration-150
                    ${currentTool === subTool.id 
                      ? 'bg-blue-600 text-white' 
                      : 'text-neutral-400 hover:bg-neutral-800 hover:text-white'}
                  `}
                  onClick={() => {
                    onToolChange(subTool.id);
                    setExpandedTool(null);
                  }}
                  title={`${subTool.name} (${subTool.shortcut})`}
                >
                  <subTool.icon className="w-5 h-5" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});

// =============================================================================
// ITEM 127: CONTEXT-SENSITIVE OPTIONS BAR
// =============================================================================

interface OptionsBarProps {
  currentTool: string;
  options: Record<string, unknown>;
  onOptionChange: (key: string, value: unknown) => void;
}

export const OptionsBar = memo(function OptionsBar({
  currentTool,
  options,
  onOptionChange
}: OptionsBarProps) {
  const renderBrushOptions = () => (
    <div className="flex items-center gap-4">
      <SliderOption
        label="Size"
        value={options.size as number || 10}
        min={1}
        max={1000}
        onChange={v => onOptionChange('size', v)}
      />
      <SliderOption
        label="Opacity"
        value={options.opacity as number || 100}
        min={0}
        max={100}
        suffix="%"
        onChange={v => onOptionChange('opacity', v)}
      />
      <SliderOption
        label="Hardness"
        value={options.hardness as number || 100}
        min={0}
        max={100}
        suffix="%"
        onChange={v => onOptionChange('hardness', v)}
      />
      <BlendModeSelect
        value={options.blendMode as string || 'normal'}
        onChange={v => onOptionChange('blendMode', v)}
      />
    </div>
  );
  
  const renderSelectionOptions = () => (
    <div className="flex items-center gap-4">
      <SelectionModeButtons
        value={options.selectionMode as string || 'new'}
        onChange={v => onOptionChange('selectionMode', v)}
      />
      <SliderOption
        label="Feather"
        value={options.feather as number || 0}
        min={0}
        max={250}
        suffix="px"
        onChange={v => onOptionChange('feather', v)}
      />
      <CheckboxOption
        label="Anti-alias"
        checked={options.antiAlias as boolean ?? true}
        onChange={v => onOptionChange('antiAlias', v)}
      />
    </div>
  );
  
  const renderTransformOptions = () => (
    <div className="flex items-center gap-4">
      <NumberInput
        label="W"
        value={options.width as number || 100}
        onChange={v => onOptionChange('width', v)}
      />
      <NumberInput
        label="H"
        value={options.height as number || 100}
        onChange={v => onOptionChange('height', v)}
      />
      <CheckboxOption
        label="Constrain"
        checked={options.constrain as boolean ?? true}
        onChange={v => onOptionChange('constrain', v)}
      />
      <NumberInput
        label="Angle"
        value={options.angle as number || 0}
        suffix="°"
        onChange={v => onOptionChange('angle', v)}
      />
    </div>
  );
  
  const getToolOptions = () => {
    if (currentTool.includes('brush') || currentTool.includes('eraser')) {
      return renderBrushOptions();
    }
    if (currentTool.includes('select')) {
      return renderSelectionOptions();
    }
    if (currentTool.includes('transform')) {
      return renderTransformOptions();
    }
    return null;
  };
  
  return (
    <div className="options-bar h-10 bg-neutral-800 border-b border-neutral-700 px-4 flex items-center">
      {getToolOptions()}
    </div>
  );
});

// =============================================================================
// ITEM 128: DOCKABLE PANELS
// =============================================================================

interface DockablePanelProps {
  id: string;
  title: string;
  icon?: React.FC<{ className?: string }>;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  onDock: (position: 'left' | 'right') => void;
  width: number;
  onResize: (width: number) => void;
  minWidth?: number;
  maxWidth?: number;
}

export const DockablePanel = memo(function DockablePanel({
  id,
  title,
  icon: Icon,
  children,
  isOpen,
  onToggle,
  onDock,
  width,
  onResize,
  minWidth = 200,
  maxWidth = 400
}: DockablePanelProps) {
  const resizeRef = useRef<HTMLDivElement>(null);
  const [isResizing, setIsResizing] = useState(false);
  
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    
    const startX = e.clientX;
    const startWidth = width;
    
    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth + delta));
      onResize(newWidth);
    };
    
    const handleMouseUp = () => {
      setIsResizing(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [width, minWidth, maxWidth, onResize]);
  
  if (!isOpen) return null;
  
  return (
    <div 
      className="dockable-panel bg-neutral-900 border-l border-neutral-700 flex flex-col"
      style={{ width }}
    >
      <div className="panel-header h-8 bg-neutral-800 px-2 flex items-center justify-between border-b border-neutral-700">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-4 h-4 text-neutral-400" />}
          <span className="text-sm font-medium text-neutral-200">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button 
            className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onDock('left')}
            title="Dock Left"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12">
              <rect x="1" y="1" width="4" height="10" fill="currentColor" opacity="0.5" />
              <rect x="6" y="1" width="5" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
            </svg>
          </button>
          <button 
            className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onDock('right')}
            title="Dock Right"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12">
              <rect x="1" y="1" width="5" height="10" stroke="currentColor" strokeWidth="1" fill="none" />
              <rect x="7" y="1" width="4" height="10" fill="currentColor" opacity="0.5" />
            </svg>
          </button>
          <button 
            className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={onToggle}
            title="Close"
          >
            <svg className="w-3 h-3" viewBox="0 0 12 12">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
        </div>
      </div>
      <div className="panel-content flex-1 overflow-auto p-2">
        {children}
      </div>
      <div 
        ref={resizeRef}
        className={`
          absolute left-0 top-0 bottom-0 w-1 cursor-ew-resize
          ${isResizing ? 'bg-blue-500' : 'hover:bg-blue-500'}
        `}
        onMouseDown={startResize}
      />
    </div>
  );
});

// =============================================================================
// ITEM 129: LAYERS PANEL
// =============================================================================

interface Layer {
  id: string;
  name: string;
  type: 'image' | 'text' | 'shape' | 'adjustment' | 'group';
  visible: boolean;
  locked: boolean;
  opacity: number;
  blendMode: string;
  thumbnail?: string;
  children?: Layer[];
}

interface LayersPanelProps {
  layers: Layer[];
  selectedLayers: string[];
  onSelect: (ids: string[], additive: boolean) => void;
  onVisibilityToggle: (id: string) => void;
  onLockToggle: (id: string) => void;
  onOpacityChange: (id: string, opacity: number) => void;
  onBlendModeChange: (id: string, mode: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (ids: string[]) => void;
  onDuplicate: (ids: string[]) => void;
  onGroup: (ids: string[]) => void;
  onAddLayer: (type: Layer['type']) => void;
}

export const LayersPanel = memo(function LayersPanel({
  layers,
  selectedLayers,
  onSelect,
  onVisibilityToggle,
  onLockToggle,
  onOpacityChange,
  onBlendModeChange,
  onReorder,
  onRename,
  onDelete,
  onDuplicate,
  onGroup,
  onAddLayer
}: LayersPanelProps) {
  const [draggedLayer, setDraggedLayer] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  
  const handleDragStart = (e: React.DragEvent, layerId: string) => {
    setDraggedLayer(layerId);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };
  
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (draggedLayer && draggedLayer !== targetId) {
      const fromIndex = layers.findIndex(l => l.id === draggedLayer);
      const toIndex = layers.findIndex(l => l.id === targetId);
      if (fromIndex !== -1 && toIndex !== -1) {
        onReorder(fromIndex, toIndex);
      }
    }
    setDraggedLayer(null);
  };
  
  return (
    <div className="layers-panel flex flex-col h-full">
      {/* Header controls */}
      <div className="flex items-center gap-2 p-2 border-b border-neutral-700">
        <BlendModeSelect
          value={selectedLayers.length === 1 
            ? layers.find(l => l.id === selectedLayers[0])?.blendMode || 'normal'
            : 'normal'
          }
          onChange={v => selectedLayers.forEach(id => onBlendModeChange(id, v))}
          compact
        />
        <SliderOption
          label="Opacity"
          value={selectedLayers.length === 1 
            ? layers.find(l => l.id === selectedLayers[0])?.opacity || 100
            : 100
          }
          min={0}
          max={100}
          suffix="%"
          onChange={v => selectedLayers.forEach(id => onOpacityChange(id, v))}
          compact
        />
      </div>
      
      {/* Layers list */}
      <div className="flex-1 overflow-auto">
        {layers.map((layer, index) => (
          <div
            key={layer.id}
            className={`
              layer-item h-12 flex items-center px-2 gap-2 border-b border-neutral-800
              cursor-pointer select-none
              ${selectedLayers.includes(layer.id) ? 'bg-blue-600/30' : 'hover:bg-neutral-800'}
              ${draggedLayer === layer.id ? 'opacity-50' : ''}
            `}
            draggable
            onDragStart={e => handleDragStart(e, layer.id)}
            onDragOver={handleDragOver}
            onDrop={e => handleDrop(e, layer.id)}
            onClick={e => onSelect([layer.id], e.shiftKey || e.ctrlKey)}
          >
            {/* Visibility */}
            <button
              className="w-6 h-6 flex items-center justify-center"
              onClick={e => { e.stopPropagation(); onVisibilityToggle(layer.id); }}
            >
              {layer.visible ? (
                <svg className="w-4 h-4 text-neutral-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-neutral-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
            
            {/* Thumbnail */}
            <div className="w-10 h-10 bg-neutral-700 rounded overflow-hidden flex-shrink-0">
              {layer.thumbnail ? (
                <img src={layer.thumbnail} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-neutral-500">
                  <LayerTypeIcon type={layer.type} />
                </div>
              )}
            </div>
            
            {/* Name */}
            {editingName === layer.id ? (
              <input
                type="text"
                defaultValue={layer.name}
                className="flex-1 bg-neutral-700 px-2 py-1 rounded text-sm"
                autoFocus
                onBlur={e => { onRename(layer.id, e.target.value); setEditingName(null); }}
                onKeyDown={e => { if (e.key === 'Enter') { onRename(layer.id, (e.target as HTMLInputElement).value); setEditingName(null); } }}
                onClick={e => e.stopPropagation()}
              />
            ) : (
              <span 
                className="flex-1 text-sm truncate"
                onDoubleClick={e => { e.stopPropagation(); setEditingName(layer.id); }}
              >
                {layer.name}
              </span>
            )}
            
            {/* Lock */}
            <button
              className="w-6 h-6 flex items-center justify-center"
              onClick={e => { e.stopPropagation(); onLockToggle(layer.id); }}
            >
              {layer.locked ? (
                <svg className="w-3 h-3 text-neutral-300" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 10h-1V7c0-3.31-2.69-6-6-6S6 3.69 6 7v3H5c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V12c0-1.1-.9-2-2-2zM8 7c0-2.21 1.79-4 4-4s4 1.79 4 4v3H8V7z" />
                </svg>
              ) : (
                <svg className="w-3 h-3 text-neutral-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 17c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm6-9h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6h2c0-1.66 1.34-3 3-3s3 1.34 3 3v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2z" />
                </svg>
              )}
            </button>
          </div>
        ))}
      </div>
      
      {/* Footer actions */}
      <div className="flex items-center justify-between p-2 border-t border-neutral-700">
        <div className="flex items-center gap-1">
          <button 
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onAddLayer('image')}
            title="New Layer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </button>
          <button 
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onGroup(selectedLayers)}
            title="Group Layers"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button 
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onDuplicate(selectedLayers)}
            title="Duplicate Layer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
          <button 
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
            onClick={() => onDelete(selectedLayers)}
            title="Delete Layer"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
});

function LayerTypeIcon({ type }: { type: Layer['type'] }) {
  switch (type) {
    case 'text':
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M5 4v3h5.5v12h3V7H19V4H5z" /></svg>;
    case 'shape':
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10" /></svg>;
    case 'adjustment':
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="4" /><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /></svg>;
    case 'group':
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11z" /></svg>;
    default:
      return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>;
  }
}

// =============================================================================
// ITEM 130: COLOR PICKER ADVANCED
// =============================================================================

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  showSwatches?: boolean;
  showHistory?: boolean;
}

export const AdvancedColorPicker = memo(function AdvancedColorPicker({
  color,
  onChange,
  showSwatches = true,
  showHistory = true
}: ColorPickerProps) {
  const [mode, setMode] = useState<'hsv' | 'hsl' | 'rgb' | 'lab'>('hsv');
  const [colorHistory, setColorHistory] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hueRef = useRef<HTMLCanvasElement>(null);
  
  const hsv = hexToHsv(color);
  const [hue, setHue] = useState(hsv.h);
  const [saturation, setSaturation] = useState(hsv.s);
  const [value, setValue] = useState(hsv.v);
  
  // Draw saturation/value gradient
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    
    // Saturation gradient (left to right)
    const satGradient = ctx.createLinearGradient(0, 0, width, 0);
    satGradient.addColorStop(0, '#fff');
    satGradient.addColorStop(1, hsvToHex({ h: hue, s: 100, v: 100 }));
    
    ctx.fillStyle = satGradient;
    ctx.fillRect(0, 0, width, height);
    
    // Value gradient (top to bottom)
    const valGradient = ctx.createLinearGradient(0, 0, 0, height);
    valGradient.addColorStop(0, 'rgba(0,0,0,0)');
    valGradient.addColorStop(1, '#000');
    
    ctx.fillStyle = valGradient;
    ctx.fillRect(0, 0, width, height);
  }, [hue]);
  
  // Draw hue bar
  useEffect(() => {
    const canvas = hueRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    const gradient = ctx.createLinearGradient(0, 0, width, 0);
    
    for (let i = 0; i <= 360; i += 60) {
      gradient.addColorStop(i / 360, hsvToHex({ h: i, s: 100, v: 100 }));
    }
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }, []);
  
  const handleSVChange = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    
    setSaturation(x * 100);
    setValue((1 - y) * 100);
    onChange(hsvToHex({ h: hue, s: x * 100, v: (1 - y) * 100 }));
  }, [hue, onChange]);
  
  const handleHueChange = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = hueRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    
    setHue(x * 360);
    onChange(hsvToHex({ h: x * 360, s: saturation, v: value }));
  }, [saturation, value, onChange]);
  
  const addToHistory = useCallback(() => {
    setColorHistory(prev => [color, ...prev.filter(c => c !== color)].slice(0, 12));
  }, [color]);
  
  return (
    <div className="color-picker p-2">
      {/* Main picker area */}
      <div className="relative mb-2">
        <canvas
          ref={canvasRef}
          width={200}
          height={150}
          className="w-full rounded cursor-crosshair"
          onClick={handleSVChange}
          onMouseDown={e => {
            handleSVChange(e);
            const onMove = (e: MouseEvent) => handleSVChange(e as unknown as React.MouseEvent<HTMLCanvasElement>);
            const onUp = () => {
              document.removeEventListener('mousemove', onMove);
              document.removeEventListener('mouseup', onUp);
              addToHistory();
            };
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
          }}
        />
        {/* Picker indicator */}
        <div 
          className="absolute w-4 h-4 border-2 border-white rounded-full shadow-lg pointer-events-none"
          style={{
            left: `calc(${saturation}% - 8px)`,
            top: `calc(${100 - value}% - 8px)`,
            backgroundColor: color
          }}
        />
      </div>
      
      {/* Hue bar */}
      <canvas
        ref={hueRef}
        width={200}
        height={12}
        className="w-full rounded cursor-pointer mb-2"
        onClick={handleHueChange}
        onMouseDown={e => {
          handleHueChange(e);
          const onMove = (e: MouseEvent) => handleHueChange(e as unknown as React.MouseEvent<HTMLCanvasElement>);
          const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          };
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
        }}
      />
      
      {/* Color preview */}
      <div className="flex items-center gap-2 mb-2">
        <div 
          className="w-10 h-10 rounded border border-neutral-600"
          style={{ backgroundColor: color }}
        />
        <input
          type="text"
          value={color}
          onChange={e => onChange(e.target.value)}
          className="flex-1 bg-neutral-800 px-2 py-1 rounded text-sm font-mono"
        />
      </div>
      
      {/* Mode tabs */}
      <div className="flex gap-1 mb-2">
        {(['hsv', 'hsl', 'rgb', 'lab'] as const).map(m => (
          <button
            key={m}
            className={`px-2 py-1 text-xs rounded ${mode === m ? 'bg-blue-600' : 'bg-neutral-700'}`}
            onClick={() => setMode(m)}
          >
            {m.toUpperCase()}
          </button>
        ))}
      </div>
      
      {/* Color history */}
      {showHistory && colorHistory.length > 0 && (
        <div className="mb-2">
          <div className="text-xs text-neutral-400 mb-1">Recent</div>
          <div className="flex flex-wrap gap-1">
            {colorHistory.map((c, i) => (
              <button
                key={i}
                className="w-5 h-5 rounded border border-neutral-600"
                style={{ backgroundColor: c }}
                onClick={() => onChange(c)}
              />
            ))}
          </div>
        </div>
      )}
      
      {/* Swatches */}
      {showSwatches && (
        <div>
          <div className="text-xs text-neutral-400 mb-1">Swatches</div>
          <div className="flex flex-wrap gap-1">
            {DEFAULT_SWATCHES.map((c, i) => (
              <button
                key={i}
                className="w-5 h-5 rounded border border-neutral-600"
                style={{ backgroundColor: c }}
                onClick={() => onChange(c)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
});

const DEFAULT_SWATCHES = [
  '#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff',
  '#ff0000', '#ff6600', '#ffcc00', '#00ff00', '#00ccff', '#0066ff',
  '#9900ff', '#ff00ff', '#ff0066', '#663300', '#006633', '#003366'
];

// =============================================================================
// ITEM 131: HISTOGRAM PANEL
// =============================================================================

interface HistogramPanelProps {
  imageData: ImageData | null;
  channel: 'rgb' | 'red' | 'green' | 'blue' | 'luminosity';
  onChannelChange: (channel: HistogramPanelProps['channel']) => void;
}

export const HistogramPanel = memo(function HistogramPanel({
  imageData,
  channel,
  onChannelChange
}: HistogramPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !imageData) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    
    // Calculate histogram
    const histR = new Uint32Array(256);
    const histG = new Uint32Array(256);
    const histB = new Uint32Array(256);
    const histL = new Uint32Array(256);
    
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      histR[data[i]]++;
      histG[data[i + 1]]++;
      histB[data[i + 2]]++;
      const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
      histL[lum]++;
    }
    
    // Find max for scaling
    let maxCount = 0;
    for (let i = 0; i < 256; i++) {
      if (channel === 'rgb' || channel === 'luminosity') {
        maxCount = Math.max(maxCount, histR[i], histG[i], histB[i], histL[i]);
      } else if (channel === 'red') {
        maxCount = Math.max(maxCount, histR[i]);
      } else if (channel === 'green') {
        maxCount = Math.max(maxCount, histG[i]);
      } else {
        maxCount = Math.max(maxCount, histB[i]);
      }
    }
    
    // Draw
    const drawHist = (hist: Uint32Array, color: string, fillAlpha: number = 0.3) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      
      for (let i = 0; i < 256; i++) {
        const x = (i / 255) * width;
        const y = height - (hist[i] / maxCount) * height;
        ctx.lineTo(x, y);
      }
      
      ctx.lineTo(width, height);
      ctx.closePath();
      
      ctx.fillStyle = color.replace(')', `, ${fillAlpha})`).replace('rgb', 'rgba');
      ctx.fill();
      
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    };
    
    if (channel === 'rgb') {
      drawHist(histR, 'rgb(255, 50, 50)');
      drawHist(histG, 'rgb(50, 255, 50)');
      drawHist(histB, 'rgb(50, 50, 255)');
    } else if (channel === 'red') {
      drawHist(histR, 'rgb(255, 50, 50)', 0.5);
    } else if (channel === 'green') {
      drawHist(histG, 'rgb(50, 255, 50)', 0.5);
    } else if (channel === 'blue') {
      drawHist(histB, 'rgb(50, 50, 255)', 0.5);
    } else {
      drawHist(histL, 'rgb(200, 200, 200)', 0.5);
    }
  }, [imageData, channel]);
  
  return (
    <div className="histogram-panel p-2">
      <canvas
        ref={canvasRef}
        width={200}
        height={100}
        className="w-full bg-neutral-800 rounded"
      />
      <div className="flex gap-1 mt-2">
        {(['rgb', 'red', 'green', 'blue', 'luminosity'] as const).map(ch => (
          <button
            key={ch}
            className={`px-2 py-1 text-xs rounded capitalize ${channel === ch ? 'bg-blue-600' : 'bg-neutral-700'}`}
            onClick={() => onChannelChange(ch)}
          >
            {ch === 'luminosity' ? 'Lum' : ch.slice(0, 1).toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
});

// =============================================================================
// ITEM 132: NAVIGATOR PANEL
// =============================================================================

interface NavigatorPanelProps {
  thumbnail: string | null;
  viewportRect: { x: number; y: number; width: number; height: number };
  zoom: number;
  onViewportChange: (rect: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
}

export const NavigatorPanel = memo(function NavigatorPanel({
  thumbnail,
  viewportRect,
  zoom,
  onViewportChange,
  onZoomChange
}: NavigatorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    const container = containerRef.current;
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    onViewportChange({ x, y });
  }, [onViewportChange]);
  
  return (
    <div className="navigator-panel p-2">
      <div 
        ref={containerRef}
        className="relative w-full aspect-video bg-neutral-800 rounded overflow-hidden cursor-pointer"
        onClick={handleClick}
      >
        {thumbnail && (
          <img src={thumbnail} alt="" className="w-full h-full object-contain" />
        )}
        <div 
          className="absolute border-2 border-red-500 pointer-events-none"
          style={{
            left: `${viewportRect.x * 100}%`,
            top: `${viewportRect.y * 100}%`,
            width: `${viewportRect.width * 100}%`,
            height: `${viewportRect.height * 100}%`
          }}
        />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <button 
          className="px-2 py-1 text-xs bg-neutral-700 rounded"
          onClick={() => onZoomChange(Math.max(1, zoom / 2))}
        >
          -
        </button>
        <span className="text-xs flex-1 text-center">{Math.round(zoom * 100)}%</span>
        <button 
          className="px-2 py-1 text-xs bg-neutral-700 rounded"
          onClick={() => onZoomChange(Math.min(3200, zoom * 2))}
        >
          +
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// ITEM 133: INFO PANEL
// =============================================================================

interface InfoPanelProps {
  cursorPosition: { x: number; y: number } | null;
  colorAtCursor: string | null;
  selectionBounds: { x: number; y: number; width: number; height: number } | null;
  documentSize: { width: number; height: number };
  zoom: number;
}

export const InfoPanel = memo(function InfoPanel({
  cursorPosition,
  colorAtCursor,
  selectionBounds,
  documentSize,
  zoom
}: InfoPanelProps) {
  const rgb = colorAtCursor ? hexToRgb(colorAtCursor) : null;
  const hsv = colorAtCursor ? hexToHsv(colorAtCursor) : null;
  
  return (
    <div className="info-panel p-2 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        {/* Cursor position */}
        <div className="text-neutral-400">X:</div>
        <div>{cursorPosition?.x ?? '-'}</div>
        <div className="text-neutral-400">Y:</div>
        <div>{cursorPosition?.y ?? '-'}</div>
        
        {/* Color at cursor */}
        {rgb && (
          <>
            <div className="text-neutral-400">R:</div>
            <div>{rgb.r}</div>
            <div className="text-neutral-400">G:</div>
            <div>{rgb.g}</div>
            <div className="text-neutral-400">B:</div>
            <div>{rgb.b}</div>
          </>
        )}
        
        {hsv && (
          <>
            <div className="text-neutral-400">H:</div>
            <div>{Math.round(hsv.h)}°</div>
            <div className="text-neutral-400">S:</div>
            <div>{Math.round(hsv.s)}%</div>
            <div className="text-neutral-400">V:</div>
            <div>{Math.round(hsv.v)}%</div>
          </>
        )}
        
        {/* Selection bounds */}
        {selectionBounds && (
          <>
            <div className="col-span-2 mt-2 text-neutral-400 border-t border-neutral-700 pt-1">Selection</div>
            <div className="text-neutral-400">W:</div>
            <div>{selectionBounds.width}px</div>
            <div className="text-neutral-400">H:</div>
            <div>{selectionBounds.height}px</div>
          </>
        )}
        
        {/* Document info */}
        <div className="col-span-2 mt-2 text-neutral-400 border-t border-neutral-700 pt-1">Document</div>
        <div className="text-neutral-400">Size:</div>
        <div>{documentSize.width} × {documentSize.height}</div>
        <div className="text-neutral-400">Zoom:</div>
        <div>{Math.round(zoom * 100)}%</div>
      </div>
    </div>
  );
});

// =============================================================================
// ITEM 134: HISTORY PANEL
// =============================================================================

interface HistoryState {
  id: string;
  name: string;
  timestamp: number;
  thumbnail?: string;
}

interface HistoryPanelProps {
  states: HistoryState[];
  currentIndex: number;
  onJumpTo: (index: number) => void;
  onSnapshot: () => void;
}

export const HistoryPanel = memo(function HistoryPanel({
  states,
  currentIndex,
  onJumpTo,
  onSnapshot
}: HistoryPanelProps) {
  return (
    <div className="history-panel flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {states.map((state, index) => (
          <div
            key={state.id}
            className={`
              flex items-center gap-2 px-2 py-1 cursor-pointer
              ${index === currentIndex ? 'bg-blue-600/30' : index > currentIndex ? 'opacity-50' : ''}
              hover:bg-neutral-800
            `}
            onClick={() => onJumpTo(index)}
          >
            {state.thumbnail && (
              <img src={state.thumbnail} alt="" className="w-8 h-8 object-cover rounded" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm truncate">{state.name}</div>
              <div className="text-xs text-neutral-500">
                {new Date(state.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-2 border-t border-neutral-700">
        <button 
          className="w-full px-3 py-1 bg-neutral-700 rounded text-sm hover:bg-neutral-600"
          onClick={onSnapshot}
        >
          Create Snapshot
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// ITEM 135: ACTIONS PANEL
// =============================================================================

interface Action {
  id: string;
  name: string;
  steps: ActionStep[];
  shortcut?: string;
}

interface ActionStep {
  id: string;
  name: string;
  command: string;
  params: Record<string, unknown>;
}

interface ActionsPanelProps {
  actions: Action[];
  onPlay: (actionId: string) => void;
  onRecord: () => void;
  onStop: () => void;
  isRecording: boolean;
  onDelete: (actionId: string) => void;
  onEdit: (actionId: string) => void;
}

export const ActionsPanel = memo(function ActionsPanel({
  actions,
  onPlay,
  onRecord,
  onStop,
  isRecording,
  onDelete,
  onEdit
}: ActionsPanelProps) {
  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  
  return (
    <div className="actions-panel flex flex-col h-full">
      <div className="flex-1 overflow-auto">
        {actions.map(action => (
          <div key={action.id} className="border-b border-neutral-800">
            <div 
              className="flex items-center gap-2 px-2 py-2 hover:bg-neutral-800 cursor-pointer"
              onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
            >
              <svg 
                className={`w-3 h-3 transition-transform ${expandedAction === action.id ? 'rotate-90' : ''}`}
                viewBox="0 0 12 12"
              >
                <path d="M4 2L10 6L4 10Z" fill="currentColor" />
              </svg>
              <span className="flex-1 text-sm">{action.name}</span>
              {action.shortcut && (
                <span className="text-xs text-neutral-500">{action.shortcut}</span>
              )}
              <button 
                className="w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
                onClick={e => { e.stopPropagation(); onPlay(action.id); }}
              >
                <svg className="w-3 h-3" viewBox="0 0 12 12"><path d="M2 1L11 6L2 11Z" fill="currentColor" /></svg>
              </button>
            </div>
            
            {expandedAction === action.id && (
              <div className="pl-6 pb-2">
                {action.steps.map(step => (
                  <div key={step.id} className="text-xs text-neutral-400 py-0.5">
                    {step.name}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="flex items-center gap-1 p-2 border-t border-neutral-700">
        <button 
          className={`w-8 h-8 flex items-center justify-center rounded ${isRecording ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-white hover:bg-neutral-700'}`}
          onClick={isRecording ? onStop : onRecord}
          title={isRecording ? 'Stop Recording' : 'Record'}
        >
          {isRecording ? (
            <svg className="w-4 h-4" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" fill="currentColor" /></svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24"><circle cx="12" cy="12" r="6" fill="currentColor" /></svg>
          )}
        </button>
        <button 
          className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded hover:bg-neutral-700"
          title="New Action"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" /></svg>
        </button>
      </div>
    </div>
  );
});

// =============================================================================
// ITEM 136: RULER & GUIDES
// =============================================================================

interface RulerProps {
  orientation: 'horizontal' | 'vertical';
  length: number;
  zoom: number;
  offset: number;
  unit: 'px' | 'in' | 'cm' | 'mm';
  guides: number[];
  onAddGuide: (position: number) => void;
}

export const Ruler = memo(function Ruler({
  orientation,
  length,
  zoom,
  offset,
  unit,
  guides,
  onAddGuide
}: RulerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isHorizontal = orientation === 'horizontal';
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, width, height);
    
    ctx.strokeStyle = '#666';
    ctx.fillStyle = '#999';
    ctx.font = '9px sans-serif';
    ctx.textBaseline = 'top';
    
    const majorStep = getStep(zoom, unit);
    const minorStep = majorStep / 5;
    const scaledMajor = majorStep * zoom;
    const scaledMinor = minorStep * zoom;
    
    const start = Math.floor(-offset / scaledMajor) * majorStep;
    const end = start + (isHorizontal ? width : height) / zoom + majorStep;
    
    for (let i = start; i < end; i += minorStep) {
      const pos = (i * zoom) + offset;
      const isMajor = i % majorStep === 0;
      
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(pos, isMajor ? 0 : height * 0.6);
        ctx.lineTo(pos, height);
      } else {
        ctx.moveTo(isMajor ? 0 : width * 0.6, pos);
        ctx.lineTo(width, pos);
      }
      ctx.stroke();
      
      if (isMajor) {
        const label = formatRulerLabel(i, unit);
        if (isHorizontal) {
          ctx.fillText(label, pos + 2, 2);
        } else {
          ctx.save();
          ctx.translate(2, pos + 2);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(label, 0, 0);
          ctx.restore();
        }
      }
    }
    
    // Draw guides
    ctx.strokeStyle = '#00aaff';
    guides.forEach(g => {
      const pos = (g * zoom) + offset;
      ctx.beginPath();
      if (isHorizontal) {
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, height);
      } else {
        ctx.moveTo(0, pos);
        ctx.lineTo(width, pos);
      }
      ctx.stroke();
    });
  }, [orientation, length, zoom, offset, unit, guides, isHorizontal]);
  
  const handleDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const pos = isHorizontal 
      ? (e.clientX - rect.left - offset) / zoom
      : (e.clientY - rect.top - offset) / zoom;
    
    onAddGuide(Math.round(pos));
  };
  
  return (
    <canvas
      ref={canvasRef}
      width={isHorizontal ? length : 20}
      height={isHorizontal ? 20 : length}
      className={`bg-neutral-800 ${isHorizontal ? 'w-full h-5' : 'w-5 h-full'}`}
      onDoubleClick={handleDoubleClick}
    />
  );
});

function getStep(zoom: number, unit: string): number {
  const baseStep = unit === 'px' ? 100 : unit === 'in' ? 1 : unit === 'cm' ? 1 : 10;
  
  if (zoom < 0.25) return baseStep * 4;
  if (zoom < 0.5) return baseStep * 2;
  if (zoom < 2) return baseStep;
  if (zoom < 4) return baseStep / 2;
  return baseStep / 4;
}

function formatRulerLabel(value: number, unit: string): string {
  if (unit === 'px') return String(value);
  return value.toFixed(unit === 'mm' ? 0 : 1);
}

// =============================================================================
// ITEM 137: GRID OVERLAY
// =============================================================================

interface GridOverlayProps {
  width: number;
  height: number;
  gridSize: number;
  subdivisions: number;
  color: string;
  opacity: number;
  visible: boolean;
}

export const GridOverlay = memo(function GridOverlay({
  width,
  height,
  gridSize,
  subdivisions,
  color,
  opacity,
  visible
}: GridOverlayProps) {
  if (!visible) return null;
  
  const majorLines: JSX.Element[] = [];
  const minorLines: JSX.Element[] = [];
  const subSize = gridSize / subdivisions;
  
  for (let x = 0; x <= width; x += subSize) {
    const isMajor = x % gridSize === 0;
    (isMajor ? majorLines : minorLines).push(
      <line key={`v${x}`} x1={x} y1={0} x2={x} y2={height} />
    );
  }
  
  for (let y = 0; y <= height; y += subSize) {
    const isMajor = y % gridSize === 0;
    (isMajor ? majorLines : minorLines).push(
      <line key={`h${y}`} x1={0} y1={y} x2={width} y2={y} />
    );
  }
  
  return (
    <svg 
      className="absolute inset-0 pointer-events-none"
      width={width}
      height={height}
      style={{ opacity }}
    >
      <g stroke={color} strokeWidth="0.5" opacity="0.3">
        {minorLines}
      </g>
      <g stroke={color} strokeWidth="1">
        {majorLines}
      </g>
    </svg>
  );
});

// =============================================================================
// ITEMS 138-150: ADDITIONAL UI COMPONENTS
// =============================================================================

// Item 138: Keyboard shortcut system
export const useKeyboardShortcuts = (shortcuts: Record<string, () => void>) => {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = [
        e.ctrlKey && 'Ctrl',
        e.altKey && 'Alt',
        e.shiftKey && 'Shift',
        e.key.toUpperCase()
      ].filter(Boolean).join('+');
      
      if (shortcuts[key]) {
        e.preventDefault();
        shortcuts[key]();
      }
    };
    
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts]);
};

// Item 139: Selection mode buttons
function SelectionModeButtons({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const modes = [
    { id: 'new', icon: '□', title: 'New Selection' },
    { id: 'add', icon: '+', title: 'Add to Selection' },
    { id: 'subtract', icon: '-', title: 'Subtract from Selection' },
    { id: 'intersect', icon: '∩', title: 'Intersect with Selection' }
  ];
  
  return (
    <div className="flex">
      {modes.map(mode => (
        <button
          key={mode.id}
          className={`w-8 h-6 flex items-center justify-center text-xs border border-neutral-600 ${value === mode.id ? 'bg-blue-600' : 'bg-neutral-700'} ${mode.id === 'new' ? 'rounded-l' : mode.id === 'intersect' ? 'rounded-r' : ''}`}
          onClick={() => onChange(mode.id)}
          title={mode.title}
        >
          {mode.icon}
        </button>
      ))}
    </div>
  );
}

// Item 140: Blend mode select
function BlendModeSelect({ value, onChange, compact = false }: { value: string; onChange: (v: string) => void; compact?: boolean }) {
  const blendModes = [
    { group: 'Normal', modes: ['normal', 'dissolve'] },
    { group: 'Darken', modes: ['darken', 'multiply', 'color-burn', 'linear-burn'] },
    { group: 'Lighten', modes: ['lighten', 'screen', 'color-dodge', 'linear-dodge'] },
    { group: 'Contrast', modes: ['overlay', 'soft-light', 'hard-light', 'vivid-light'] },
    { group: 'Comparative', modes: ['difference', 'exclusion', 'subtract', 'divide'] },
    { group: 'Component', modes: ['hue', 'saturation', 'color', 'luminosity'] }
  ];
  
  return (
    <select 
      className={`bg-neutral-700 rounded text-sm ${compact ? 'w-24 px-1 py-0.5' : 'px-2 py-1'}`}
      value={value}
      onChange={e => onChange(e.target.value)}
    >
      {blendModes.map(group => (
        <optgroup key={group.group} label={group.group}>
          {group.modes.map(mode => (
            <option key={mode} value={mode}>
              {mode.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Item 141: Slider option
function SliderOption({ 
  label, 
  value, 
  min, 
  max, 
  onChange, 
  suffix = '', 
  compact = false 
}: { 
  label: string; 
  value: number; 
  min: number; 
  max: number; 
  onChange: (v: number) => void; 
  suffix?: string;
  compact?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  
  return (
    <div className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="text-neutral-400 w-12">{label}:</span>
      {isEditing ? (
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          className="w-16 bg-neutral-700 px-1 rounded"
          autoFocus
          onChange={e => onChange(Number(e.target.value))}
          onBlur={() => setIsEditing(false)}
          onKeyDown={e => e.key === 'Enter' && setIsEditing(false)}
        />
      ) : (
        <span 
          className="w-12 cursor-pointer hover:bg-neutral-700 px-1 rounded"
          onClick={() => setIsEditing(true)}
        >
          {value}{suffix}
        </span>
      )}
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-20 accent-blue-500"
      />
    </div>
  );
}

// Item 142: Number input
function NumberInput({ 
  label, 
  value, 
  onChange, 
  suffix = '' 
}: { 
  label: string; 
  value: number; 
  onChange: (v: number) => void; 
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-neutral-400">{label}:</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="w-16 bg-neutral-700 px-2 py-0.5 rounded"
      />
      {suffix && <span className="text-neutral-400">{suffix}</span>}
    </div>
  );
}

// Item 143: Checkbox option
function CheckboxOption({ 
  label, 
  checked, 
  onChange 
}: { 
  label: string; 
  checked: boolean; 
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        className="accent-blue-500"
      />
      <span>{label}</span>
    </label>
  );
}

// Item 144: Status bar
export const StatusBar = memo(function StatusBar({
  zoom,
  documentSize,
  fileSize,
  colorMode,
  bitDepth
}: {
  zoom: number;
  documentSize: { width: number; height: number };
  fileSize: string;
  colorMode: string;
  bitDepth: number;
}) {
  return (
    <div className="status-bar h-6 bg-neutral-800 border-t border-neutral-700 px-2 flex items-center justify-between text-xs text-neutral-400">
      <div className="flex items-center gap-4">
        <span>{documentSize.width} × {documentSize.height}</span>
        <span>{colorMode}/{bitDepth}-bit</span>
        <span>{fileSize}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>{Math.round(zoom * 100)}%</span>
      </div>
    </div>
  );
});

// Item 145: Workspace presets
export const WORKSPACE_PRESETS: WorkspaceLayout[] = [
  {
    id: 'essentials',
    name: 'Essentials',
    panels: { left: [], right: ['layers', 'colors'] },
    toolbarVisible: true,
    rulerVisible: false
  },
  {
    id: 'painting',
    name: 'Painting',
    panels: { left: ['brushes'], right: ['layers', 'colors', 'swatches'] },
    toolbarVisible: true,
    rulerVisible: false
  },
  {
    id: 'photography',
    name: 'Photography',
    panels: { left: ['navigator', 'histogram'], right: ['layers', 'adjustments', 'history'] },
    toolbarVisible: true,
    rulerVisible: true
  }
];

// Items 146-150: Utility functions

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  
  let h = 0;
  const s = max === 0 ? 0 : (d / max) * 100;
  const v = (max / 255) * 100;
  
  if (d !== 0) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  
  return { h, s, v };
}

function hsvToHex({ h, s, v }: { h: number; s: number; v: number }): string {
  s /= 100;
  v /= 100;
  
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  
  let r = 0, g = 0, b = 0;
  
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  
  const toHex = (n: number) => Math.round((n + m) * 255).toString(16).padStart(2, '0');
  
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  BlendModeSelect,
  SliderOption,
  NumberInput,
  CheckboxOption,
  SelectionModeButtons
};

export default {
  AdaptiveToolbar,
  OptionsBar,
  DockablePanel,
  LayersPanel,
  AdvancedColorPicker,
  HistogramPanel,
  NavigatorPanel,
  InfoPanel,
  HistoryPanel,
  ActionsPanel,
  Ruler,
  GridOverlay,
  StatusBar,
  useKeyboardShortcuts,
  WORKSPACE_PRESETS
};
