// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// =============================================================================
// DEX System Apps Enhancement (Phase 3: Items 976-1025)
// Premium features for Browser, Files, Workflows, Kanban, and Calendar
// =============================================================================

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';

// =============================================================================
// BROWSER (Items 976-985)
// =============================================================================

// ---------------------------------------------------------------------------
// 976-978. Tab Previews with Thumbnails
// ---------------------------------------------------------------------------

export interface BrowserTab {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  thumbnail?: string;
  loading: boolean;
  error?: string;
  canGoBack: boolean;
  canGoForward: boolean;
  lastAccessed: number;
  pinned: boolean;
  muted: boolean;
  groupId?: string;
}

export interface TabPreviewConfig {
  showThumbnails: boolean;
  thumbnailWidth: number;
  thumbnailHeight: number;
  hoverDelay: number;
  fadeInDuration: number;
}

const defaultTabPreviewConfig: TabPreviewConfig = {
  showThumbnails: true,
  thumbnailWidth: 240,
  thumbnailHeight: 160,
  hoverDelay: 300,
  fadeInDuration: 150,
};

export function useTabPreview(config: Partial<TabPreviewConfig> = {}) {
  const cfg = { ...defaultTabPreviewConfig, ...config };
  const [previewTab, setPreviewTab] = useState<BrowserTab | null>(null);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
  const showPreview = useCallback((tab: BrowserTab, x: number, y: number) => {
    clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = setTimeout(() => {
      setPreviewTab(tab);
      setPreviewPosition({ x, y });
      setIsVisible(true);
    }, cfg.hoverDelay);
  }, [cfg.hoverDelay]);
  
  const hidePreview = useCallback(() => {
    clearTimeout(hoverTimeoutRef.current);
    setIsVisible(false);
    setTimeout(() => setPreviewTab(null), cfg.fadeInDuration);
  }, [cfg.fadeInDuration]);
  
  useEffect(() => {
    return () => clearTimeout(hoverTimeoutRef.current);
  }, []);
  
  return {
    previewTab,
    previewPosition,
    isVisible,
    showPreview,
    hidePreview,
    config: cfg,
  };
}

// ---------------------------------------------------------------------------
// 979-980. Split View Mode
// ---------------------------------------------------------------------------

export interface SplitViewState {
  mode: 'single' | 'horizontal' | 'vertical' | 'grid';
  panes: SplitPane[];
  focusedPaneId: string | null;
}

export interface SplitPane {
  id: string;
  tabId: string;
  size: number; // Percentage
  minSize: number;
  maxSize: number;
}

export function createSplitViewState(): SplitViewState {
  return {
    mode: 'single',
    panes: [],
    focusedPaneId: null,
  };
}

export function splitView(
  state: SplitViewState,
  direction: 'horizontal' | 'vertical',
  newTabId: string
): SplitViewState {
  const currentPane = state.panes.find(p => p.id === state.focusedPaneId) || state.panes[0];
  
  if (!currentPane) {
    // Create initial panes
    return {
      mode: direction,
      panes: [
        { id: 'pane-1', tabId: newTabId, size: 50, minSize: 20, maxSize: 80 },
        { id: 'pane-2', tabId: newTabId, size: 50, minSize: 20, maxSize: 80 },
      ],
      focusedPaneId: 'pane-1',
    };
  }
  
  const newPaneId = `pane-${Date.now()}`;
  const newSize = currentPane.size / 2;
  
  return {
    ...state,
    mode: direction,
    panes: [
      ...state.panes.map(p => 
        p.id === currentPane.id ? { ...p, size: newSize } : p
      ),
      { id: newPaneId, tabId: newTabId, size: newSize, minSize: 20, maxSize: 80 },
    ],
    focusedPaneId: newPaneId,
  };
}

export function closeSplitPane(state: SplitViewState, paneId: string): SplitViewState {
  const remaining = state.panes.filter(p => p.id !== paneId);
  
  if (remaining.length <= 1) {
    return {
      mode: 'single',
      panes: remaining.length === 1 ? [{ ...remaining[0], size: 100 }] : [],
      focusedPaneId: remaining[0]?.id || null,
    };
  }
  
  // Redistribute size
  const totalSize = remaining.reduce((sum, p) => sum + p.size, 0);
  const scale = 100 / totalSize;
  
  return {
    ...state,
    panes: remaining.map(p => ({ ...p, size: p.size * scale })),
    focusedPaneId: state.focusedPaneId === paneId ? remaining[0].id : state.focusedPaneId,
  };
}

// ---------------------------------------------------------------------------
// 981-982. Vertical Tab Bar
// ---------------------------------------------------------------------------

export interface VerticalTabsConfig {
  width: number;
  collapsedWidth: number;
  showTitles: boolean;
  showFavicons: boolean;
  groupTabs: boolean;
  sortBy: 'manual' | 'title' | 'domain' | 'lastAccessed';
}

const defaultVerticalTabsConfig: VerticalTabsConfig = {
  width: 200,
  collapsedWidth: 48,
  showTitles: true,
  showFavicons: true,
  groupTabs: true,
  sortBy: 'manual',
};

export interface TabGroup {
  id: string;
  name: string;
  color: string;
  collapsed: boolean;
  tabIds: string[];
}

const tabGroupColors = [
  '#FF453A', '#FF9F0A', '#FFD60A', '#34C759',
  '#4A9EFF', '#BF5AF2', '#FF2D55', '#64D2FF',
];

export function createTabGroup(name: string, color?: string): TabGroup {
  return {
    id: `group-${Date.now()}`,
    name,
    color: color || tabGroupColors[Math.floor(Math.random() * tabGroupColors.length)],
    collapsed: false,
    tabIds: [],
  };
}

export function groupTabsByDomain(tabs: BrowserTab[]): Map<string, BrowserTab[]> {
  const groups = new Map<string, BrowserTab[]>();
  
  for (const tab of tabs) {
    try {
      const url = new URL(tab.url);
      const domain = url.hostname.replace('www.', '');
      const existing = groups.get(domain) || [];
      groups.set(domain, [...existing, tab]);
    } catch {
      const existing = groups.get('other') || [];
      groups.set('other', [...existing, tab]);
    }
  }
  
  return groups;
}

// ---------------------------------------------------------------------------
// 983-985. Reader Mode & Privacy Indicators
// ---------------------------------------------------------------------------

export interface ReaderModeConfig {
  fontSize: number;
  fontFamily: 'serif' | 'sans-serif' | 'mono';
  lineHeight: number;
  maxWidth: number;
  theme: 'light' | 'sepia' | 'dark' | 'auto';
  textAlign: 'left' | 'justify';
}

const defaultReaderModeConfig: ReaderModeConfig = {
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.8,
  maxWidth: 680,
  theme: 'auto',
  textAlign: 'left',
};

export interface PrivacyIndicator {
  httpsSecure: boolean;
  trackersBlocked: number;
  cookiesBlocked: number;
  fingerprintingBlocked: boolean;
  encryptionLevel: 'none' | 'partial' | 'full';
  certificateValid: boolean;
  certificateIssuer?: string;
}

export function getPrivacyScore(indicator: PrivacyIndicator): number {
  let score = 0;
  if (indicator.httpsSecure) score += 30;
  if (indicator.certificateValid) score += 20;
  if (indicator.fingerprintingBlocked) score += 20;
  score += Math.min(20, indicator.trackersBlocked * 2);
  if (indicator.encryptionLevel === 'full') score += 10;
  return Math.min(100, score);
}

export function getPrivacyGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}


// =============================================================================
// FILES (Items 986-995)
// =============================================================================

// ---------------------------------------------------------------------------
// 986-988. Column View (Miller Columns)
// ---------------------------------------------------------------------------

export interface ColumnViewState {
  columns: Column[];
  selectedPath: string[];
  scrollPositions: number[];
}

export interface Column {
  path: string;
  items: FileItem[];
  selectedIndex: number;
  loading: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink';
  size: number;
  modified: Date;
  created: Date;
  icon?: string;
  extension?: string;
  hidden: boolean;
  permissions?: string;
}

export function createColumnViewState(rootPath: string): ColumnViewState {
  return {
    columns: [{ path: rootPath, items: [], selectedIndex: -1, loading: true }],
    selectedPath: [rootPath],
    scrollPositions: [0],
  };
}

export function navigateToPath(
  state: ColumnViewState,
  columnIndex: number,
  itemIndex: number,
  item: FileItem
): ColumnViewState {
  if (item.type !== 'directory') {
    // File selected - just update selection
    return {
      ...state,
      columns: state.columns.slice(0, columnIndex + 1).map((col, i) =>
        i === columnIndex ? { ...col, selectedIndex: itemIndex } : col
      ),
      selectedPath: [...state.selectedPath.slice(0, columnIndex), item.path],
    };
  }
  
  // Directory selected - add new column
  return {
    columns: [
      ...state.columns.slice(0, columnIndex + 1).map((col, i) =>
        i === columnIndex ? { ...col, selectedIndex: itemIndex } : col
      ),
      { path: item.path, items: [], selectedIndex: -1, loading: true },
    ],
    selectedPath: [...state.selectedPath.slice(0, columnIndex + 1), item.path],
    scrollPositions: [...state.scrollPositions.slice(0, columnIndex + 1), 0],
  };
}

export function updateColumnItems(
  state: ColumnViewState,
  columnIndex: number,
  items: FileItem[]
): ColumnViewState {
  return {
    ...state,
    columns: state.columns.map((col, i) =>
      i === columnIndex ? { ...col, items, loading: false } : col
    ),
  };
}

// ---------------------------------------------------------------------------
// 989-990. Quick Look Preview
// ---------------------------------------------------------------------------

export interface QuickLookState {
  isOpen: boolean;
  file: FileItem | null;
  previewType: QuickLookType | null;
  loading: boolean;
  error?: string;
}

export type QuickLookType = 
  | 'image' | 'video' | 'audio' | 'pdf' 
  | 'text' | 'code' | 'markdown' 
  | 'archive' | 'model' | 'font'
  | 'spreadsheet' | 'presentation' | 'document'
  | 'unknown';

const extensionToType: Record<string, QuickLookType> = {
  // Images
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', ico: 'image',
  // Video
  mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video',
  // Audio
  mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio', aac: 'audio', m4a: 'audio',
  // Documents
  pdf: 'pdf', doc: 'document', docx: 'document', odt: 'document',
  xls: 'spreadsheet', xlsx: 'spreadsheet', csv: 'spreadsheet', ods: 'spreadsheet',
  ppt: 'presentation', pptx: 'presentation', odp: 'presentation',
  // Text
  txt: 'text', rtf: 'text', log: 'text',
  // Code
  js: 'code', ts: 'code', jsx: 'code', tsx: 'code', json: 'code', html: 'code', css: 'code',
  py: 'code', rs: 'code', go: 'code', java: 'code', cpp: 'code', c: 'code', h: 'code',
  // Markdown
  md: 'markdown', mdx: 'markdown',
  // Archives
  zip: 'archive', tar: 'archive', gz: 'archive', '7z': 'archive', rar: 'archive',
  // 3D Models
  obj: 'model', gltf: 'model', glb: 'model', fbx: 'model', stl: 'model',
  // Fonts
  ttf: 'font', otf: 'font', woff: 'font', woff2: 'font',
};

export function getQuickLookType(file: FileItem): QuickLookType {
  const ext = file.extension?.toLowerCase() || file.name.split('.').pop()?.toLowerCase() || '';
  return extensionToType[ext] || 'unknown';
}

export function createQuickLookState(): QuickLookState {
  return {
    isOpen: false,
    file: null,
    previewType: null,
    loading: false,
  };
}

export function openQuickLook(file: FileItem): QuickLookState {
  return {
    isOpen: true,
    file,
    previewType: getQuickLookType(file),
    loading: true,
  };
}

// ---------------------------------------------------------------------------
// 991-993. Batch Rename with Patterns
// ---------------------------------------------------------------------------

export interface BatchRenamePattern {
  type: 'replace' | 'prefix' | 'suffix' | 'case' | 'number' | 'date' | 'regex';
  params: Record<string, string | number | boolean>;
}

export interface BatchRenameResult {
  original: string;
  renamed: string;
  error?: string;
}

export function applyBatchRename(
  files: string[],
  patterns: BatchRenamePattern[]
): BatchRenameResult[] {
  return files.map((file, index) => {
    try {
      let result = file;
      
      for (const pattern of patterns) {
        result = applyPattern(result, pattern, index, files.length);
      }
      
      return { original: file, renamed: result };
    } catch (error) {
      return { original: file, renamed: file, error: String(error) };
    }
  });
}

function applyPattern(
  filename: string,
  pattern: BatchRenamePattern,
  index: number,
  total: number
): string {
  const ext = filename.includes('.') ? filename.split('.').pop() || '' : '';
  const name = ext ? filename.slice(0, -(ext.length + 1)) : filename;
  
  switch (pattern.type) {
    case 'replace': {
      const { find, replace, useRegex, caseSensitive } = pattern.params;
      const flags = `g${caseSensitive ? '' : 'i'}`;
      const regex = useRegex ? new RegExp(String(find), flags) : new RegExp(escapeRegex(String(find)), flags);
      return name.replace(regex, String(replace)) + (ext ? `.${ext}` : '');
    }
    
    case 'prefix':
      return `${pattern.params.text}${filename}`;
    
    case 'suffix': {
      const text = String(pattern.params.text);
      return name + text + (ext ? `.${ext}` : '');
    }
    
    case 'case': {
      const mode = pattern.params.mode as string;
      let newName = name;
      switch (mode) {
        case 'upper': newName = name.toUpperCase(); break;
        case 'lower': newName = name.toLowerCase(); break;
        case 'title': newName = name.replace(/\b\w/g, c => c.toUpperCase()); break;
        case 'sentence': newName = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase(); break;
      }
      return newName + (ext ? `.${ext}` : '');
    }
    
    case 'number': {
      const { start = 1, padding = 3, position = 'suffix', separator = '_' } = pattern.params;
      const num = String(Number(start) + index).padStart(Number(padding), '0');
      if (position === 'prefix') return `${num}${separator}${filename}`;
      return name + separator + num + (ext ? `.${ext}` : '');
    }
    
    case 'date': {
      const format = String(pattern.params.format || 'YYYY-MM-DD');
      const now = new Date();
      const dateStr = format
        .replace('YYYY', String(now.getFullYear()))
        .replace('MM', String(now.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(now.getDate()).padStart(2, '0'))
        .replace('HH', String(now.getHours()).padStart(2, '0'))
        .replace('mm', String(now.getMinutes()).padStart(2, '0'))
        .replace('ss', String(now.getSeconds()).padStart(2, '0'));
      return `${name}_${dateStr}${ext ? `.${ext}` : ''}`;
    }
    
    case 'regex': {
      const { pattern: regex, replace } = pattern.params;
      return filename.replace(new RegExp(String(regex), 'g'), String(replace));
    }
    
    default:
      return filename;
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ---------------------------------------------------------------------------
// 994-995. File Tags & Smart Folders
// ---------------------------------------------------------------------------

export interface FileTag {
  id: string;
  name: string;
  color: string;
}

export interface SmartFolder {
  id: string;
  name: string;
  icon: string;
  query: SmartFolderQuery;
  sortBy: 'name' | 'modified' | 'created' | 'size' | 'type';
  sortDirection: 'asc' | 'desc';
}

export interface SmartFolderQuery {
  conditions: SmartFolderCondition[];
  logic: 'all' | 'any';
}

export interface SmartFolderCondition {
  field: 'name' | 'extension' | 'size' | 'modified' | 'created' | 'tag' | 'type';
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'greaterThan' | 'lessThan' | 'between' | 'in';
  value: string | number | string[];
}

const defaultTags: FileTag[] = [
  { id: 'red', name: 'Red', color: '#FF453A' },
  { id: 'orange', name: 'Orange', color: '#FF9F0A' },
  { id: 'yellow', name: 'Yellow', color: '#FFD60A' },
  { id: 'green', name: 'Green', color: '#34C759' },
  { id: 'blue', name: 'Blue', color: '#4A9EFF' },
  { id: 'purple', name: 'Purple', color: '#BF5AF2' },
  { id: 'gray', name: 'Gray', color: '#8E8E93' },
];

export function matchesSmartFolder(file: FileItem, query: SmartFolderQuery): boolean {
  const results = query.conditions.map(condition => matchesCondition(file, condition));
  return query.logic === 'all' ? results.every(Boolean) : results.some(Boolean);
}

function matchesCondition(file: FileItem, condition: SmartFolderCondition): boolean {
  const { field, operator, value } = condition;
  
  let fieldValue: string | number | Date;
  switch (field) {
    case 'name': fieldValue = file.name; break;
    case 'extension': fieldValue = file.extension || ''; break;
    case 'size': fieldValue = file.size; break;
    case 'modified': fieldValue = file.modified; break;
    case 'created': fieldValue = file.created; break;
    case 'type': fieldValue = file.type; break;
    default: return false;
  }
  
  switch (operator) {
    case 'equals':
      return String(fieldValue).toLowerCase() === String(value).toLowerCase();
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(value).toLowerCase());
    case 'startsWith':
      return String(fieldValue).toLowerCase().startsWith(String(value).toLowerCase());
    case 'endsWith':
      return String(fieldValue).toLowerCase().endsWith(String(value).toLowerCase());
    case 'greaterThan':
      return Number(fieldValue) > Number(value);
    case 'lessThan':
      return Number(fieldValue) < Number(value);
    case 'in':
      return Array.isArray(value) && value.includes(String(fieldValue));
    default:
      return false;
  }
}


// =============================================================================
// WORKFLOWS (Items 996-1005)
// =============================================================================

// ---------------------------------------------------------------------------
// 996-998. Node Connection Animations
// ---------------------------------------------------------------------------

export interface NodeConnection {
  id: string;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
  dataType: 'any' | 'string' | 'number' | 'boolean' | 'array' | 'object';
  animated: boolean;
  color?: string;
}

export interface ConnectionAnimationState {
  connectionId: string;
  progress: number; // 0-1, position of "data packet" along the connection
  speed: number;
  particleCount: number;
  active: boolean;
}

export function createConnectionAnimation(connectionId: string): ConnectionAnimationState {
  return {
    connectionId,
    progress: 0,
    speed: 0.02,
    particleCount: 3,
    active: true,
  };
}

export function updateConnectionAnimations(
  animations: ConnectionAnimationState[],
  deltaTime: number
): ConnectionAnimationState[] {
  return animations.map(anim => ({
    ...anim,
    progress: anim.active ? (anim.progress + anim.speed * deltaTime) % 1 : anim.progress,
  }));
}

export function renderConnectionWithAnimation(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  animation: ConnectionAnimationState,
  baseColor: string = '#4A9EFF'
): void {
  ctx.save();
  
  // Draw base connection (bezier curve)
  const midX = (startX + endX) / 2;
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(midX, startY, midX, endY, endX, endY);
  ctx.stroke();
  
  // Draw animated particles
  if (animation.active) {
    for (let i = 0; i < animation.particleCount; i++) {
      const particleProgress = (animation.progress + i / animation.particleCount) % 1;
      const point = getPointOnBezier(startX, startY, midX, startY, midX, endY, endX, endY, particleProgress);
      
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
      ctx.fill();
      
      // Glow
      const gradient = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 12);
      gradient.addColorStop(0, `${baseColor}80`);
      gradient.addColorStop(1, `${baseColor}00`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  
  ctx.restore();
}

function getPointOnBezier(
  x1: number, y1: number,
  cx1: number, cy1: number,
  cx2: number, cy2: number,
  x2: number, y2: number,
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  
  return {
    x: mt3 * x1 + 3 * mt2 * t * cx1 + 3 * mt * t2 * cx2 + t3 * x2,
    y: mt3 * y1 + 3 * mt2 * t * cy1 + 3 * mt * t2 * cy2 + t3 * y2,
  };
}

// ---------------------------------------------------------------------------
// 999-1001. Debug Mode with Data Inspection
// ---------------------------------------------------------------------------

export interface WorkflowDebugState {
  isDebugging: boolean;
  breakpoints: Set<string>; // Node IDs
  currentNodeId: string | null;
  stepMode: 'continue' | 'step-over' | 'step-into' | 'step-out';
  executionHistory: ExecutionStep[];
  watchedVariables: Map<string, unknown>;
  callStack: string[];
}

export interface ExecutionStep {
  nodeId: string;
  nodeName: string;
  timestamp: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  duration: number;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}

export function createDebugState(): WorkflowDebugState {
  return {
    isDebugging: false,
    breakpoints: new Set(),
    currentNodeId: null,
    stepMode: 'continue',
    executionHistory: [],
    watchedVariables: new Map(),
    callStack: [],
  };
}

export function toggleBreakpoint(state: WorkflowDebugState, nodeId: string): WorkflowDebugState {
  const breakpoints = new Set(state.breakpoints);
  if (breakpoints.has(nodeId)) {
    breakpoints.delete(nodeId);
  } else {
    breakpoints.add(nodeId);
  }
  return { ...state, breakpoints };
}

export function addExecutionStep(state: WorkflowDebugState, step: ExecutionStep): WorkflowDebugState {
  return {
    ...state,
    executionHistory: [...state.executionHistory, step],
    currentNodeId: step.nodeId,
    callStack: step.status === 'success' ? [...state.callStack, step.nodeId] : state.callStack,
  };
}

// ---------------------------------------------------------------------------
// 1002-1005. Node Templates & Favorites
// ---------------------------------------------------------------------------

export interface NodeTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  color: string;
  inputs: PortDefinition[];
  outputs: PortDefinition[];
  defaultConfig: Record<string, unknown>;
  tags: string[];
  usageCount: number;
  favorite: boolean;
}

export interface PortDefinition {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'any';
  required: boolean;
  defaultValue?: unknown;
}

const builtInNodeCategories = [
  { id: 'triggers', name: 'Triggers', icon: 'trigger' },
  { id: 'actions', name: 'Actions', icon: 'action' },
  { id: 'logic', name: 'Logic', icon: 'logic' },
  { id: 'data', name: 'Data', icon: 'data' },
  { id: 'integrations', name: 'Integrations', icon: 'plugin' },
  { id: 'ai', name: 'AI', icon: 'ai' },
];

export function searchNodeTemplates(
  templates: NodeTemplate[],
  query: string,
  category?: string
): NodeTemplate[] {
  let filtered = templates;
  
  if (category) {
    filtered = filtered.filter(t => t.category === category);
  }
  
  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.toLowerCase().includes(q))
    );
  }
  
  // Sort by favorites, then usage count
  return filtered.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return b.usageCount - a.usageCount;
  });
}


// =============================================================================
// KANBAN (Items 1006-1015)
// =============================================================================

// ---------------------------------------------------------------------------
// 1006-1008. Swimlanes
// ---------------------------------------------------------------------------

export interface KanbanBoard {
  id: string;
  name: string;
  columns: KanbanColumn[];
  swimlanes: Swimlane[];
  cards: KanbanCard[];
}

export interface KanbanColumn {
  id: string;
  name: string;
  order: number;
  color?: string;
  wipLimit?: number;
  collapsed: boolean;
}

export interface Swimlane {
  id: string;
  name: string;
  order: number;
  color: string;
  collapsed: boolean;
  defaultAssignee?: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  description?: string;
  columnId: string;
  swimlaneId?: string;
  order: number;
  labels: string[];
  assignees: string[];
  dueDate?: Date;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  storyPoints?: number;
  attachments: number;
  comments: number;
  checklist?: { total: number; completed: number };
}

export function getCardsInCell(
  cards: KanbanCard[],
  columnId: string,
  swimlaneId?: string
): KanbanCard[] {
  return cards
    .filter(c => c.columnId === columnId && c.swimlaneId === swimlaneId)
    .sort((a, b) => a.order - b.order);
}

export function moveCard(
  cards: KanbanCard[],
  cardId: string,
  targetColumnId: string,
  targetSwimlaneId: string | undefined,
  targetIndex: number
): KanbanCard[] {
  const card = cards.find(c => c.id === cardId);
  if (!card) return cards;
  
  // Get cards in target cell
  const targetCards = getCardsInCell(cards, targetColumnId, targetSwimlaneId);
  
  // Remove card from current position
  const withoutCard = cards.filter(c => c.id !== cardId);
  
  // Insert at new position
  const newOrder = targetIndex === 0
    ? (targetCards[0]?.order ?? 1000) - 1
    : targetIndex >= targetCards.length
      ? (targetCards[targetCards.length - 1]?.order ?? 0) + 1
      : (targetCards[targetIndex - 1].order + targetCards[targetIndex].order) / 2;
  
  return [
    ...withoutCard,
    { ...card, columnId: targetColumnId, swimlaneId: targetSwimlaneId, order: newOrder },
  ];
}

// ---------------------------------------------------------------------------
// 1009-1011. WIP Limits & Metrics
// ---------------------------------------------------------------------------

export interface ColumnMetrics {
  cardCount: number;
  wipLimit?: number;
  isOverLimit: boolean;
  averageAge: number; // Days
  totalStoryPoints: number;
  blockedCount: number;
}

export interface BoardMetrics {
  totalCards: number;
  completedCards: number;
  inProgressCards: number;
  overdueCards: number;
  averageCycleTime: number; // Days
  throughput: number; // Cards per week
  wipUtilization: number; // Percentage
}

export function calculateColumnMetrics(
  column: KanbanColumn,
  cards: KanbanCard[]
): ColumnMetrics {
  const columnCards = cards.filter(c => c.columnId === column.id);
  const now = new Date();
  
  return {
    cardCount: columnCards.length,
    wipLimit: column.wipLimit,
    isOverLimit: column.wipLimit ? columnCards.length > column.wipLimit : false,
    averageAge: 0, // Would need card creation dates
    totalStoryPoints: columnCards.reduce((sum, c) => sum + (c.storyPoints || 0), 0),
    blockedCount: 0, // Would need blocked status
  };
}

export function getWIPStatus(
  count: number,
  limit?: number
): 'ok' | 'warning' | 'exceeded' {
  if (!limit) return 'ok';
  if (count > limit) return 'exceeded';
  if (count >= limit * 0.8) return 'warning';
  return 'ok';
}

export const wipStatusColors = {
  ok: '#34C759',
  warning: '#FF9F0A',
  exceeded: '#FF453A',
};

// ---------------------------------------------------------------------------
// 1012-1015. Card Quick Actions & Filters
// ---------------------------------------------------------------------------

export interface CardFilter {
  labels?: string[];
  assignees?: string[];
  priority?: KanbanCard['priority'][];
  dueDate?: 'overdue' | 'today' | 'this-week' | 'no-date';
  search?: string;
}

export function filterCards(cards: KanbanCard[], filter: CardFilter): KanbanCard[] {
  return cards.filter(card => {
    if (filter.labels?.length && !filter.labels.some(l => card.labels.includes(l))) {
      return false;
    }
    if (filter.assignees?.length && !filter.assignees.some(a => card.assignees.includes(a))) {
      return false;
    }
    if (filter.priority?.length && !filter.priority.includes(card.priority)) {
      return false;
    }
    if (filter.dueDate) {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekEnd = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
      
      switch (filter.dueDate) {
        case 'overdue':
          if (!card.dueDate || card.dueDate >= today) return false;
          break;
        case 'today':
          if (!card.dueDate || card.dueDate.toDateString() !== today.toDateString()) return false;
          break;
        case 'this-week':
          if (!card.dueDate || card.dueDate > weekEnd) return false;
          break;
        case 'no-date':
          if (card.dueDate) return false;
          break;
      }
    }
    if (filter.search) {
      const q = filter.search.toLowerCase();
      if (!card.title.toLowerCase().includes(q) && 
          !card.description?.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });
}


// =============================================================================
// CALENDAR (Items 1016-1025)
// =============================================================================

// ---------------------------------------------------------------------------
// 1016-1018. Natural Language Event Input
// ---------------------------------------------------------------------------

export interface ParsedEvent {
  title: string;
  startDate?: Date;
  endDate?: Date;
  allDay: boolean;
  location?: string;
  recurrence?: RecurrenceRule;
  reminders?: number[]; // Minutes before
  confidence: number;
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;
  daysOfWeek?: number[];
  dayOfMonth?: number;
  endDate?: Date;
  count?: number;
}

const timePatterns = [
  { pattern: /at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, extract: 'time' },
  { pattern: /(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i, extract: 'time' },
  { pattern: /from\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s+to\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i, extract: 'range' },
];

const datePatterns = [
  { pattern: /tomorrow/i, offset: 1 },
  { pattern: /today/i, offset: 0 },
  { pattern: /next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, type: 'next-day' },
  { pattern: /on\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/i, type: 'day' },
  { pattern: /(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/i, type: 'date' },
];

const recurrencePatterns = [
  { pattern: /every\s+day/i, frequency: 'daily' as const, interval: 1 },
  { pattern: /daily/i, frequency: 'daily' as const, interval: 1 },
  { pattern: /every\s+week/i, frequency: 'weekly' as const, interval: 1 },
  { pattern: /weekly/i, frequency: 'weekly' as const, interval: 1 },
  { pattern: /every\s+month/i, frequency: 'monthly' as const, interval: 1 },
  { pattern: /monthly/i, frequency: 'monthly' as const, interval: 1 },
  { pattern: /every\s+year/i, frequency: 'yearly' as const, interval: 1 },
  { pattern: /yearly|annually/i, frequency: 'yearly' as const, interval: 1 },
];

export function parseNaturalLanguageEvent(input: string): ParsedEvent {
  let title = input;
  let startDate: Date | undefined;
  let endDate: Date | undefined;
  let allDay = true;
  let location: string | undefined;
  let recurrence: RecurrenceRule | undefined;
  let confidence = 0.5;
  
  // Extract location
  const locationMatch = input.match(/(?:at|in|@)\s+([^,]+?)(?:,|\s+(?:at|on|from|tomorrow|today|next))/i);
  if (locationMatch) {
    location = locationMatch[1].trim();
    title = title.replace(locationMatch[0], ' ');
  }
  
  // Extract date
  const now = new Date();
  for (const { pattern, offset, type } of datePatterns) {
    const match = input.match(pattern);
    if (match) {
      if (offset !== undefined) {
        startDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
        confidence += 0.15;
      } else if (type === 'next-day' || type === 'day') {
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const targetDay = dayNames.indexOf(match[1].toLowerCase());
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        if (type === 'next-day' && daysUntil < 7) daysUntil += 7;
        startDate = new Date(now.getTime() + daysUntil * 24 * 60 * 60 * 1000);
        confidence += 0.15;
      }
      title = title.replace(match[0], ' ');
      break;
    }
  }
  
  // Extract time
  for (const { pattern, extract } of timePatterns) {
    const match = input.match(pattern);
    if (match) {
      if (!startDate) startDate = new Date();
      
      let hours = parseInt(match[1], 10);
      const minutes = match[2] ? parseInt(match[2], 10) : 0;
      const ampm = match[3]?.toLowerCase();
      
      if (ampm === 'pm' && hours < 12) hours += 12;
      if (ampm === 'am' && hours === 12) hours = 0;
      
      startDate.setHours(hours, minutes, 0, 0);
      allDay = false;
      confidence += 0.2;
      
      if (extract === 'range' && match[4]) {
        endDate = new Date(startDate);
        let endHours = parseInt(match[4], 10);
        const endMinutes = match[5] ? parseInt(match[5], 10) : 0;
        const endAmpm = match[6]?.toLowerCase();
        
        if (endAmpm === 'pm' && endHours < 12) endHours += 12;
        if (endAmpm === 'am' && endHours === 12) endHours = 0;
        
        endDate.setHours(endHours, endMinutes, 0, 0);
        confidence += 0.1;
      }
      
      title = title.replace(match[0], ' ');
      break;
    }
  }
  
  // Extract recurrence
  for (const { pattern, frequency, interval } of recurrencePatterns) {
    if (pattern.test(input)) {
      recurrence = { frequency, interval };
      confidence += 0.1;
      title = title.replace(pattern, ' ');
      break;
    }
  }
  
  // Clean up title
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) title = 'New Event';
  
  return {
    title,
    startDate,
    endDate,
    allDay,
    location,
    recurrence,
    confidence: Math.min(1, confidence),
  };
}

// ---------------------------------------------------------------------------
// 1019-1021. Availability View
// ---------------------------------------------------------------------------

export interface TimeSlot {
  start: Date;
  end: Date;
  status: 'free' | 'busy' | 'tentative' | 'out-of-office';
  eventId?: string;
}

export interface AvailabilityGrid {
  startDate: Date;
  endDate: Date;
  granularity: number; // Minutes per slot
  slots: TimeSlot[];
  workingHours: { start: number; end: number }; // Hours (0-23)
}

export function createAvailabilityGrid(
  startDate: Date,
  days: number,
  granularity: number = 30
): AvailabilityGrid {
  const endDate = new Date(startDate.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    startDate,
    endDate,
    granularity,
    slots: [],
    workingHours: { start: 9, end: 17 },
  };
}

export function findFreeSlots(
  grid: AvailabilityGrid,
  duration: number // Minutes
): TimeSlot[] {
  const freeSlots: TimeSlot[] = [];
  const { startDate, endDate, granularity, slots, workingHours } = grid;
  
  let current = new Date(startDate);
  current.setHours(workingHours.start, 0, 0, 0);
  
  while (current < endDate) {
    const slotEnd = new Date(current.getTime() + duration * 60 * 1000);
    
    // Check if within working hours
    const hour = current.getHours();
    if (hour >= workingHours.start && hour < workingHours.end) {
      // Check if conflicts with any existing slot
      const hasConflict = slots.some(s => 
        s.status !== 'free' &&
        current < s.end && slotEnd > s.start
      );
      
      if (!hasConflict) {
        freeSlots.push({
          start: new Date(current),
          end: slotEnd,
          status: 'free',
        });
      }
    }
    
    // Move to next slot
    current = new Date(current.getTime() + granularity * 60 * 1000);
    
    // Skip to next working day if past working hours
    if (current.getHours() >= workingHours.end) {
      current.setDate(current.getDate() + 1);
      current.setHours(workingHours.start, 0, 0, 0);
    }
  }
  
  return freeSlots;
}

// ---------------------------------------------------------------------------
// 1022-1025. Calendar Integrations & Sync
// ---------------------------------------------------------------------------

export interface CalendarAccount {
  id: string;
  type: 'local' | 'google' | 'outlook' | 'caldav' | 'ical';
  name: string;
  email?: string;
  color: string;
  enabled: boolean;
  lastSync?: Date;
  syncStatus: 'idle' | 'syncing' | 'error';
  error?: string;
}

export interface CalendarEvent {
  id: string;
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  recurrenceRule?: RecurrenceRule;
  reminders: number[];
  attendees: EventAttendee[];
  status: 'confirmed' | 'tentative' | 'cancelled';
  visibility: 'public' | 'private' | 'confidential';
  created: Date;
  modified: Date;
}

export interface EventAttendee {
  email: string;
  name?: string;
  status: 'accepted' | 'declined' | 'tentative' | 'needs-action';
  organizer: boolean;
  optional: boolean;
}

export interface SyncResult {
  added: number;
  updated: number;
  deleted: number;
  errors: string[];
  duration: number;
}

export function mergeEvents(
  local: CalendarEvent[],
  remote: CalendarEvent[]
): { merged: CalendarEvent[]; conflicts: CalendarEvent[][] } {
  const merged: CalendarEvent[] = [];
  const conflicts: CalendarEvent[][] = [];
  const remoteMap = new Map(remote.map(e => [e.id, e]));
  const localMap = new Map(local.map(e => [e.id, e]));
  
  // Process local events
  for (const localEvent of local) {
    const remoteEvent = remoteMap.get(localEvent.id);
    
    if (!remoteEvent) {
      // Only in local
      merged.push(localEvent);
    } else if (localEvent.modified > remoteEvent.modified) {
      // Local is newer
      merged.push(localEvent);
    } else if (remoteEvent.modified > localEvent.modified) {
      // Remote is newer
      merged.push(remoteEvent);
    } else {
      // Same modification time but different content - conflict
      if (JSON.stringify(localEvent) !== JSON.stringify(remoteEvent)) {
        conflicts.push([localEvent, remoteEvent]);
      }
      merged.push(localEvent);
    }
    
    remoteMap.delete(localEvent.id);
  }
  
  // Add remaining remote events (not in local)
  for (const remoteEvent of remoteMap.values()) {
    merged.push(remoteEvent);
  }
  
  return { merged, conflicts };
}


// =============================================================================
// EXPORTS
// =============================================================================

export {
  defaultTabPreviewConfig,
  defaultVerticalTabsConfig,
  tabGroupColors,
  defaultReaderModeConfig,
  defaultTags,
  builtInNodeCategories,
};
