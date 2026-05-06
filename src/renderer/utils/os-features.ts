// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// =============================================================================
// DEX OS-Inspired Features (Phase 6: Items 1176-1275)
// Spotlight, Spaces, Mission Control, Widgets, Quick Actions
// =============================================================================

// =============================================================================
// SPOTLIGHT SEARCH (Items 1176-1195)
// =============================================================================

// ---------------------------------------------------------------------------
// 1176-1180. Spotlight Core
// ---------------------------------------------------------------------------

export interface SpotlightResult {
  id: string;
  type: SpotlightResultType;
  title: string;
  subtitle?: string;
  icon?: string;
  iconColor?: string;
  preview?: SpotlightPreview;
  action: SpotlightAction;
  score: number;
  metadata?: Record<string, unknown>;
}

export type SpotlightResultType =
  | 'app'
  | 'file'
  | 'folder'
  | 'setting'
  | 'contact'
  | 'event'
  | 'email'
  | 'command'
  | 'calculation'
  | 'definition'
  | 'web'
  | 'shortcut'
  | 'recent';

export interface SpotlightPreview {
  type: 'text' | 'image' | 'file' | 'rich';
  content: string;
  metadata?: Record<string, unknown>;
}

export type SpotlightAction =
  | { type: 'open'; target: string }
  | { type: 'execute'; command: string; args?: unknown[] }
  | { type: 'navigate'; path: string }
  | { type: 'copy'; value: string }
  | { type: 'url'; url: string };

export interface SpotlightProvider {
  id: string;
  name: string;
  types: SpotlightResultType[];
  search: (query: string, options: SpotlightSearchOptions) => Promise<SpotlightResult[]>;
  priority: number;
  icon?: string;
}

export interface SpotlightSearchOptions {
  limit: number;
  types?: SpotlightResultType[];
  includeRecent?: boolean;
  context?: Record<string, unknown>;
}

export class SpotlightEngine {
  private providers: SpotlightProvider[] = [];
  private recentSearches: string[] = [];
  private recentResults: SpotlightResult[] = [];
  private maxRecent = 20;
  
  registerProvider(provider: SpotlightProvider): void {
    this.providers.push(provider);
    this.providers.sort((a, b) => b.priority - a.priority);
  }
  
  unregisterProvider(providerId: string): void {
    this.providers = this.providers.filter(p => p.id !== providerId);
  }
  
  async search(query: string, options: Partial<SpotlightSearchOptions> = {}): Promise<SpotlightResult[]> {
    const opts: SpotlightSearchOptions = {
      limit: options.limit || 20,
      types: options.types,
      includeRecent: options.includeRecent ?? true,
      context: options.context,
    };
    
    if (!query.trim()) {
      return opts.includeRecent ? this.getRecent() : [];
    }
    
    // Search all providers in parallel
    const searchPromises = this.providers
      .filter(p => !opts.types || p.types.some(t => opts.types!.includes(t)))
      .map(async provider => {
        try {
          return await provider.search(query, opts);
        } catch (e) {
          console.error(`Spotlight provider ${provider.id} error:`, e);
          return [];
        }
      });
    
    const resultsArrays = await Promise.all(searchPromises);
    let results = resultsArrays.flat();
    
    // Sort by score
    results.sort((a, b) => b.score - a.score);
    
    // Limit results
    results = results.slice(0, opts.limit);
    
    // Track recent
    if (query.length >= 2) {
      this.addRecentSearch(query);
    }
    
    return results;
  }
  
  addRecentSearch(query: string): void {
    this.recentSearches = this.recentSearches.filter(s => s !== query);
    this.recentSearches.unshift(query);
    if (this.recentSearches.length > this.maxRecent) {
      this.recentSearches.pop();
    }
  }
  
  addRecentResult(result: SpotlightResult): void {
    this.recentResults = this.recentResults.filter(r => r.id !== result.id);
    this.recentResults.unshift({ ...result, type: 'recent' });
    if (this.recentResults.length > this.maxRecent) {
      this.recentResults.pop();
    }
  }
  
  getRecent(): SpotlightResult[] {
    return this.recentResults;
  }
  
  getRecentSearches(): string[] {
    return this.recentSearches;
  }
  
  clearRecent(): void {
    this.recentSearches = [];
    this.recentResults = [];
  }
}

// ---------------------------------------------------------------------------
// 1181-1185. Built-in Providers
// ---------------------------------------------------------------------------

// Calculator provider - uses AV-safe math parser (no new Function())
export function createCalculatorProvider(): SpotlightProvider {
  return {
    id: 'calculator',
    name: 'Calculator',
    types: ['calculation'],
    priority: 100,
    icon: 'calculator',
    
    async search(query: string): Promise<SpotlightResult[]> {
      // Simple math expression detection
      if (!/^[0-9+\-*/().%^\s]+$/.test(query)) return [];
      
      try {
        // AV-safe: Use safeMath parser instead of new Function()
        const { safeMath, formatResult } = await import('./safeMath');
        const result = safeMath(query);
        
        if (result !== null && !isNaN(result)) {
          return [{
            id: 'calc-result',
            type: 'calculation',
            title: formatResult(result),
            subtitle: query,
            icon: 'calculator',
            action: { type: 'copy', value: formatResult(result) },
            score: 100,
          }];
        }
      } catch {
        // Invalid expression
      }
      
      return [];
    },
  };
}

// App launcher provider
export function createAppLauncherProvider(apps: Array<{
  id: string;
  name: string;
  icon: string;
  command: string;
  keywords?: string[];
}>): SpotlightProvider {
  return {
    id: 'apps',
    name: 'Applications',
    types: ['app'],
    priority: 90,
    icon: 'apps',
    
    async search(query: string): Promise<SpotlightResult[]> {
      const lowerQuery = query.toLowerCase();
      
      return apps
        .filter(app => 
          app.name.toLowerCase().includes(lowerQuery) ||
          app.keywords?.some(k => k.toLowerCase().includes(lowerQuery))
        )
        .map(app => ({
          id: `app-${app.id}`,
          type: 'app' as SpotlightResultType,
          title: app.name,
          icon: app.icon,
          action: { type: 'execute' as const, command: app.command },
          score: app.name.toLowerCase().startsWith(lowerQuery) ? 95 : 80,
        }));
    },
  };
}

// File search provider
export function createFileSearchProvider(
  searchFn: (query: string) => Promise<Array<{
    path: string;
    name: string;
    type: 'file' | 'folder';
    modified?: Date;
    size?: number;
  }>>
): SpotlightProvider {
  return {
    id: 'files',
    name: 'Files & Folders',
    types: ['file', 'folder'],
    priority: 80,
    icon: 'folder',
    
    async search(query: string, options): Promise<SpotlightResult[]> {
      const results = await searchFn(query);
      
      return results.slice(0, options.limit).map(file => ({
        id: `file-${file.path}`,
        type: file.type,
        title: file.name,
        subtitle: file.path,
        icon: file.type === 'folder' ? 'folder' : 'file',
        action: { type: 'open' as const, target: file.path },
        score: file.name.toLowerCase().startsWith(query.toLowerCase()) ? 85 : 70,
        metadata: { modified: file.modified, size: file.size },
      }));
    },
  };
}

// Command palette provider
export function createCommandProvider(commands: Array<{
  id: string;
  title: string;
  category?: string;
  shortcut?: string;
  execute: () => void;
}>): SpotlightProvider {
  return {
    id: 'commands',
    name: 'Commands',
    types: ['command'],
    priority: 85,
    icon: 'terminal',
    
    async search(query: string): Promise<SpotlightResult[]> {
      const lowerQuery = query.toLowerCase();
      
      // Check for command prefix
      if (!query.startsWith('>')) return [];
      const searchTerm = query.slice(1).trim().toLowerCase();
      if (!searchTerm) {
        return commands.slice(0, 10).map(cmd => ({
          id: `cmd-${cmd.id}`,
          type: 'command' as SpotlightResultType,
          title: cmd.title,
          subtitle: cmd.category,
          icon: '⌘',
          action: { type: 'execute' as const, command: cmd.id },
          score: 50,
          metadata: { shortcut: cmd.shortcut },
        }));
      }
      
      return commands
        .filter(cmd => cmd.title.toLowerCase().includes(searchTerm))
        .map(cmd => ({
          id: `cmd-${cmd.id}`,
          type: 'command' as SpotlightResultType,
          title: cmd.title,
          subtitle: cmd.category,
          icon: '⌘',
          action: { type: 'execute' as const, command: cmd.id },
          score: cmd.title.toLowerCase().startsWith(searchTerm) ? 90 : 75,
          metadata: { shortcut: cmd.shortcut },
        }));
    },
  };
}

// ---------------------------------------------------------------------------
// 1186-1190. Quick Look Preview
// ---------------------------------------------------------------------------

export interface QuickLookConfig {
  maxPreviewSize: number;
  supportedTypes: string[];
  thumbnailSize: { width: number; height: number };
}

export const defaultQuickLookConfig: QuickLookConfig = {
  maxPreviewSize: 10 * 1024 * 1024, // 10MB
  supportedTypes: [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
    'text/plain', 'text/markdown', 'text/html', 'text/css', 'text/javascript',
    'application/json', 'application/pdf',
    'audio/mpeg', 'audio/wav', 'audio/ogg',
    'video/mp4', 'video/webm',
  ],
  thumbnailSize: { width: 400, height: 300 },
};

export interface QuickLookPreviewData {
  type: 'image' | 'text' | 'video' | 'audio' | 'pdf' | 'unsupported';
  content?: string;
  url?: string;
  metadata: {
    name: string;
    size: number;
    mimeType: string;
    dimensions?: { width: number; height: number };
    duration?: number;
    modified?: Date;
  };
}

export async function generateQuickLookPreview(
  file: File,
  config: QuickLookConfig = defaultQuickLookConfig
): Promise<QuickLookPreviewData> {
  const metadata: QuickLookPreviewData['metadata'] = {
    name: file.name,
    size: file.size,
    mimeType: file.type,
    modified: new Date(file.lastModified),
  };
  
  if (file.size > config.maxPreviewSize) {
    return { type: 'unsupported', metadata };
  }
  
  // Image preview
  if (file.type.startsWith('image/')) {
    const url = URL.createObjectURL(file);
    const dimensions = await getImageDimensions(url);
    return {
      type: 'image',
      url,
      metadata: { ...metadata, dimensions },
    };
  }
  
  // Text preview
  if (file.type.startsWith('text/') || file.type === 'application/json') {
    const content = await file.text();
    return {
      type: 'text',
      content: content.slice(0, 5000),
      metadata,
    };
  }
  
  // Video preview
  if (file.type.startsWith('video/')) {
    const url = URL.createObjectURL(file);
    const duration = await getVideoDuration(url);
    return {
      type: 'video',
      url,
      metadata: { ...metadata, duration },
    };
  }
  
  // Audio preview
  if (file.type.startsWith('audio/')) {
    const url = URL.createObjectURL(file);
    const duration = await getAudioDuration(url);
    return {
      type: 'audio',
      url,
      metadata: { ...metadata, duration },
    };
  }
  
  return { type: 'unsupported', metadata };
}

async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.width, height: img.height });
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = url;
  });
}

async function getVideoDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.onloadedmetadata = () => resolve(video.duration);
    video.onerror = () => resolve(0);
    video.src = url;
  });
}

async function getAudioDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const audio = new Audio();
    audio.onloadedmetadata = () => resolve(audio.duration);
    audio.onerror = () => resolve(0);
    audio.src = url;
  });
}

// ---------------------------------------------------------------------------
// 1191-1195. Spotlight Keyboard Navigation
// ---------------------------------------------------------------------------

export interface SpotlightNavigationState {
  selectedIndex: number;
  results: SpotlightResult[];
  previewVisible: boolean;
  query: string;
}

export type SpotlightNavigationAction =
  | { type: 'SET_RESULTS'; results: SpotlightResult[] }
  | { type: 'SELECT_NEXT' }
  | { type: 'SELECT_PREV' }
  | { type: 'SELECT_INDEX'; index: number }
  | { type: 'TOGGLE_PREVIEW' }
  | { type: 'SET_QUERY'; query: string }
  | { type: 'RESET' };

export function spotlightNavigationReducer(
  state: SpotlightNavigationState,
  action: SpotlightNavigationAction
): SpotlightNavigationState {
  switch (action.type) {
    case 'SET_RESULTS':
      return {
        ...state,
        results: action.results,
        selectedIndex: action.results.length > 0 ? 0 : -1,
      };
    
    case 'SELECT_NEXT':
      return {
        ...state,
        selectedIndex: Math.min(state.selectedIndex + 1, state.results.length - 1),
      };
    
    case 'SELECT_PREV':
      return {
        ...state,
        selectedIndex: Math.max(state.selectedIndex - 1, 0),
      };
    
    case 'SELECT_INDEX':
      return {
        ...state,
        selectedIndex: Math.max(0, Math.min(action.index, state.results.length - 1)),
      };
    
    case 'TOGGLE_PREVIEW':
      return {
        ...state,
        previewVisible: !state.previewVisible,
      };
    
    case 'SET_QUERY':
      return {
        ...state,
        query: action.query,
      };
    
    case 'RESET':
      return {
        selectedIndex: -1,
        results: [],
        previewVisible: false,
        query: '',
      };
    
    default:
      return state;
  }
}


// =============================================================================
// SPACES & VIRTUAL DESKTOPS (Items 1196-1215)
// =============================================================================

// ---------------------------------------------------------------------------
// 1196-1200. Spaces Core
// ---------------------------------------------------------------------------

export interface Space {
  id: string;
  name: string;
  index: number;
  wallpaper?: string;
  windows: SpaceWindow[];
  isActive: boolean;
  createdAt: Date;
}

export interface SpaceWindow {
  id: string;
  appId: string;
  title: string;
  bounds: { x: number; y: number; width: number; height: number };
  zIndex: number;
  isMinimized: boolean;
  isMaximized: boolean;
}

export interface SpacesConfig {
  maxSpaces: number;
  showPreviews: boolean;
  animationDuration: number;
  persistLayout: boolean;
}

export const defaultSpacesConfig: SpacesConfig = {
  maxSpaces: 16,
  showPreviews: true,
  animationDuration: 300,
  persistLayout: true,
};

export class SpacesManager {
  private spaces: Space[] = [];
  private activeSpaceId: string | null = null;
  private config: SpacesConfig;
  private listeners = new Set<(spaces: Space[], activeId: string | null) => void>();
  
  constructor(config: Partial<SpacesConfig> = {}) {
    this.config = { ...defaultSpacesConfig, ...config };
    this.createSpace('Desktop 1');
  }
  
  createSpace(name?: string): Space {
    if (this.spaces.length >= this.config.maxSpaces) {
      throw new Error('Maximum spaces reached');
    }
    
    const space: Space = {
      id: crypto.randomUUID(),
      name: name || `Desktop ${this.spaces.length + 1}`,
      index: this.spaces.length,
      windows: [],
      isActive: false,
      createdAt: new Date(),
    };
    
    this.spaces.push(space);
    
    if (this.spaces.length === 1) {
      this.switchToSpace(space.id);
    }
    
    this.notifyListeners();
    return space;
  }
  
  deleteSpace(spaceId: string): void {
    if (this.spaces.length <= 1) {
      throw new Error('Cannot delete the last space');
    }
    
    const index = this.spaces.findIndex(s => s.id === spaceId);
    if (index === -1) return;
    
    const deletedSpace = this.spaces[index];
    
    // Move windows to adjacent space
    const targetIndex = index > 0 ? index - 1 : 1;
    const targetSpace = this.spaces[targetIndex];
    targetSpace.windows.push(...deletedSpace.windows);
    
    // Remove space
    this.spaces.splice(index, 1);
    
    // Update indices
    for (let i = index; i < this.spaces.length; i++) {
      this.spaces[i].index = i;
    }
    
    // Switch if was active
    if (this.activeSpaceId === spaceId) {
      this.switchToSpace(targetSpace.id);
    }
    
    this.notifyListeners();
  }
  
  switchToSpace(spaceId: string): void {
    const space = this.spaces.find(s => s.id === spaceId);
    if (!space) return;
    
    // Deactivate current
    if (this.activeSpaceId) {
      const current = this.spaces.find(s => s.id === this.activeSpaceId);
      if (current) current.isActive = false;
    }
    
    // Activate new
    space.isActive = true;
    this.activeSpaceId = spaceId;
    
    this.notifyListeners();
  }
  
  switchToNext(): void {
    const currentIndex = this.spaces.findIndex(s => s.id === this.activeSpaceId);
    const nextIndex = (currentIndex + 1) % this.spaces.length;
    this.switchToSpace(this.spaces[nextIndex].id);
  }
  
  switchToPrev(): void {
    const currentIndex = this.spaces.findIndex(s => s.id === this.activeSpaceId);
    const prevIndex = (currentIndex - 1 + this.spaces.length) % this.spaces.length;
    this.switchToSpace(this.spaces[prevIndex].id);
  }
  
  moveWindowToSpace(windowId: string, targetSpaceId: string): void {
    let window: SpaceWindow | undefined;
    let sourceSpace: Space | undefined;
    
    for (const space of this.spaces) {
      const idx = space.windows.findIndex(w => w.id === windowId);
      if (idx !== -1) {
        window = space.windows[idx];
        sourceSpace = space;
        space.windows.splice(idx, 1);
        break;
      }
    }
    
    if (!window) return;
    
    const targetSpace = this.spaces.find(s => s.id === targetSpaceId);
    if (targetSpace) {
      targetSpace.windows.push(window);
    }
    
    this.notifyListeners();
  }
  
  addWindowToSpace(window: SpaceWindow, spaceId?: string): void {
    const targetId = spaceId || this.activeSpaceId;
    const space = this.spaces.find(s => s.id === targetId);
    if (space) {
      space.windows.push(window);
      this.notifyListeners();
    }
  }
  
  getSpace(spaceId: string): Space | undefined {
    return this.spaces.find(s => s.id === spaceId);
  }
  
  getActiveSpace(): Space | undefined {
    return this.spaces.find(s => s.id === this.activeSpaceId);
  }
  
  getAllSpaces(): Space[] {
    return [...this.spaces];
  }
  
  renameSpace(spaceId: string, name: string): void {
    const space = this.spaces.find(s => s.id === spaceId);
    if (space) {
      space.name = name;
      this.notifyListeners();
    }
  }
  
  reorderSpaces(fromIndex: number, toIndex: number): void {
    const [space] = this.spaces.splice(fromIndex, 1);
    this.spaces.splice(toIndex, 0, space);
    
    // Update indices
    this.spaces.forEach((s, i) => { s.index = i; });
    
    this.notifyListeners();
  }
  
  onSpacesChange(listener: (spaces: Space[], activeId: string | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener([...this.spaces], this.activeSpaceId);
    }
  }
}

// ---------------------------------------------------------------------------
// 1201-1205. Space Transitions
// ---------------------------------------------------------------------------

export interface SpaceTransition {
  type: 'slide' | 'fade' | 'cube' | 'flip';
  direction: 'left' | 'right' | 'up' | 'down';
  duration: number;
  easing: string;
}

export function getSpaceTransitionStyles(
  transition: SpaceTransition,
  progress: number, // 0 to 1
  isOutgoing: boolean
): { transform: string; opacity: number } {
  const { type, direction, easing } = transition;
  const easedProgress = easeProgress(progress, easing);
  
  switch (type) {
    case 'slide': {
      const offset = isOutgoing ? -100 * easedProgress : 100 - 100 * easedProgress;
      const axis = direction === 'left' || direction === 'right' ? 'X' : 'Y';
      const sign = direction === 'left' || direction === 'up' ? 1 : -1;
      return {
        transform: `translate${axis}(${offset * sign}%)`,
        opacity: 1,
      };
    }
    
    case 'fade':
      return {
        transform: 'none',
        opacity: isOutgoing ? 1 - easedProgress : easedProgress,
      };
    
    case 'cube': {
      const rotation = isOutgoing ? 90 * easedProgress : -90 + 90 * easedProgress;
      const scale = 1 - 0.1 * Math.sin(Math.PI * easedProgress);
      return {
        transform: `perspective(1000px) rotateY(${rotation}deg) scale(${scale})`,
        opacity: 1,
      };
    }
    
    case 'flip': {
      const rotation = isOutgoing ? 180 * easedProgress : -180 + 180 * easedProgress;
      return {
        transform: `perspective(1000px) rotateY(${rotation}deg)`,
        opacity: Math.abs(rotation) > 90 ? 0 : 1,
      };
    }
    
    default:
      return { transform: 'none', opacity: 1 };
  }
}

function easeProgress(t: number, easing: string): number {
  switch (easing) {
    case 'ease-out':
      return 1 - Math.pow(1 - t, 3);
    case 'ease-in':
      return Math.pow(t, 3);
    case 'ease-in-out':
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    default:
      return t;
  }
}

// ---------------------------------------------------------------------------
// 1206-1215. Mission Control
// ---------------------------------------------------------------------------

export interface MissionControlState {
  isActive: boolean;
  zoomLevel: number;
  selectedWindowId: string | null;
  selectedSpaceId: string | null;
  windowPositions: Map<string, { x: number; y: number; scale: number }>;
}

export interface MissionControlConfig {
  gridGap: number;
  windowScale: number;
  animationDuration: number;
  showAppLabels: boolean;
  groupByApp: boolean;
}

export const defaultMissionControlConfig: MissionControlConfig = {
  gridGap: 20,
  windowScale: 0.15,
  animationDuration: 300,
  showAppLabels: true,
  groupByApp: false,
};

export function calculateMissionControlLayout(
  windows: SpaceWindow[],
  viewportSize: { width: number; height: number },
  config: MissionControlConfig = defaultMissionControlConfig
): Map<string, { x: number; y: number; scale: number; width: number; height: number }> {
  const positions = new Map<string, { x: number; y: number; scale: number; width: number; height: number }>();
  
  if (windows.length === 0) return positions;
  
  // Calculate grid layout
  const cols = Math.ceil(Math.sqrt(windows.length));
  const rows = Math.ceil(windows.length / cols);
  
  const cellWidth = (viewportSize.width - (cols + 1) * config.gridGap) / cols;
  const cellHeight = (viewportSize.height - (rows + 1) * config.gridGap) / rows;
  
  windows.forEach((window, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    
    // Calculate scale to fit in cell
    const scaleX = cellWidth / window.bounds.width;
    const scaleY = cellHeight / window.bounds.height;
    const scale = Math.min(scaleX, scaleY, config.windowScale);
    
    const scaledWidth = window.bounds.width * scale;
    const scaledHeight = window.bounds.height * scale;
    
    // Center in cell
    const x = config.gridGap + col * (cellWidth + config.gridGap) + (cellWidth - scaledWidth) / 2;
    const y = config.gridGap + row * (cellHeight + config.gridGap) + (cellHeight - scaledHeight) / 2;
    
    positions.set(window.id, { x, y, scale, width: scaledWidth, height: scaledHeight });
  });
  
  return positions;
}

export interface ExposedWindow {
  window: SpaceWindow;
  thumbnailUrl?: string;
  isHovered: boolean;
  isSelected: boolean;
}

export function getMissionControlAnimationStyles(
  window: SpaceWindow,
  targetPosition: { x: number; y: number; scale: number },
  isActive: boolean,
  progress: number
): { transform: string; transition: string } {
  if (!isActive) {
    return {
      transform: `translate(${window.bounds.x}px, ${window.bounds.y}px) scale(1)`,
      transition: 'transform 0.3s ease-out',
    };
  }
  
  const currentX = window.bounds.x + (targetPosition.x - window.bounds.x) * progress;
  const currentY = window.bounds.y + (targetPosition.y - window.bounds.y) * progress;
  const currentScale = 1 + (targetPosition.scale - 1) * progress;
  
  return {
    transform: `translate(${currentX}px, ${currentY}px) scale(${currentScale})`,
    transition: 'none',
  };
}


// =============================================================================
// WIDGETS (Items 1216-1245)
// =============================================================================

// ---------------------------------------------------------------------------
// 1216-1220. Widget System Core
// ---------------------------------------------------------------------------

export interface Widget {
  id: string;
  type: string;
  title: string;
  size: WidgetSize;
  position: { x: number; y: number };
  config: Record<string, unknown>;
  refreshInterval?: number;
  lastRefresh?: Date;
}

export type WidgetSize = 'small' | 'medium' | 'large' | 'extra-large';

export interface WidgetDefinition {
  type: string;
  name: string;
  description: string;
  icon: string;
  supportedSizes: WidgetSize[];
  defaultSize: WidgetSize;
  configSchema?: WidgetConfigSchema;
  render: (widget: Widget, data: unknown) => string;
  fetchData?: (widget: Widget) => Promise<unknown>;
}

export interface WidgetConfigSchema {
  fields: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select' | 'color';
    label: string;
    defaultValue?: unknown;
    options?: Array<{ label: string; value: unknown }>;
  }>;
}

export const widgetSizeDimensions: Record<WidgetSize, { width: number; height: number; cols: number; rows: number }> = {
  'small': { width: 170, height: 170, cols: 2, rows: 2 },
  'medium': { width: 350, height: 170, cols: 4, rows: 2 },
  'large': { width: 350, height: 350, cols: 4, rows: 4 },
  'extra-large': { width: 530, height: 350, cols: 6, rows: 4 },
};

export class WidgetManager {
  private widgets: Widget[] = [];
  private definitions = new Map<string, WidgetDefinition>();
  private data = new Map<string, unknown>();
  private refreshTimers = new Map<string, ReturnType<typeof setInterval>>();
  private listeners = new Set<(widgets: Widget[]) => void>();
  
  registerDefinition(definition: WidgetDefinition): void {
    this.definitions.set(definition.type, definition);
  }
  
  unregisterDefinition(type: string): void {
    this.definitions.delete(type);
  }
  
  getDefinition(type: string): WidgetDefinition | undefined {
    return this.definitions.get(type);
  }
  
  getAllDefinitions(): WidgetDefinition[] {
    return Array.from(this.definitions.values());
  }
  
  addWidget(type: string, config: Partial<Widget> = {}): Widget {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`Widget type "${type}" not registered`);
    }
    
    const widget: Widget = {
      id: crypto.randomUUID(),
      type,
      title: definition.name,
      size: config.size || definition.defaultSize,
      position: config.position || { x: 0, y: 0 },
      config: config.config || {},
      refreshInterval: config.refreshInterval,
    };
    
    this.widgets.push(widget);
    this.refreshWidget(widget.id);
    
    if (widget.refreshInterval) {
      this.startRefreshTimer(widget);
    }
    
    this.notifyListeners();
    return widget;
  }
  
  removeWidget(widgetId: string): void {
    const timer = this.refreshTimers.get(widgetId);
    if (timer) {
      clearInterval(timer);
      this.refreshTimers.delete(widgetId);
    }
    
    this.widgets = this.widgets.filter(w => w.id !== widgetId);
    this.data.delete(widgetId);
    this.notifyListeners();
  }
  
  updateWidget(widgetId: string, updates: Partial<Widget>): void {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    Object.assign(widget, updates);
    
    // Restart refresh timer if interval changed
    if (updates.refreshInterval !== undefined) {
      const timer = this.refreshTimers.get(widgetId);
      if (timer) clearInterval(timer);
      
      if (updates.refreshInterval) {
        this.startRefreshTimer(widget);
      }
    }
    
    this.notifyListeners();
  }
  
  async refreshWidget(widgetId: string): Promise<void> {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const definition = this.definitions.get(widget.type);
    if (!definition?.fetchData) return;
    
    try {
      const data = await definition.fetchData(widget);
      this.data.set(widgetId, data);
      widget.lastRefresh = new Date();
      this.notifyListeners();
    } catch (e) {
      console.error(`Failed to refresh widget ${widgetId}:`, e);
    }
  }
  
  getWidgetData(widgetId: string): unknown {
    return this.data.get(widgetId);
  }
  
  renderWidget(widgetId: string): string {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (!widget) return '';
    
    const definition = this.definitions.get(widget.type);
    if (!definition) return '';
    
    const data = this.data.get(widgetId);
    return definition.render(widget, data);
  }
  
  getWidgets(): Widget[] {
    return [...this.widgets];
  }
  
  moveWidget(widgetId: string, position: { x: number; y: number }): void {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (widget) {
      widget.position = position;
      this.notifyListeners();
    }
  }
  
  resizeWidget(widgetId: string, size: WidgetSize): void {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (!widget) return;
    
    const definition = this.definitions.get(widget.type);
    if (!definition?.supportedSizes.includes(size)) return;
    
    widget.size = size;
    this.notifyListeners();
  }
  
  private startRefreshTimer(widget: Widget): void {
    if (!widget.refreshInterval) return;
    
    const timer = setInterval(() => {
      this.refreshWidget(widget.id);
    }, widget.refreshInterval);
    
    this.refreshTimers.set(widget.id, timer);
  }
  
  onChange(listener: (widgets: Widget[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener([...this.widgets]);
    }
  }
}

// ---------------------------------------------------------------------------
// 1221-1230. Built-in Widgets
// ---------------------------------------------------------------------------

export const clockWidgetDefinition: WidgetDefinition = {
  type: 'clock',
  name: 'Clock',
  description: 'Displays current time',
  icon: 'clock',
  supportedSizes: ['small', 'medium'],
  defaultSize: 'small',
  configSchema: {
    fields: [
      { name: 'format', type: 'select', label: 'Format', options: [
        { label: '12-hour', value: '12h' },
        { label: '24-hour', value: '24h' },
      ], defaultValue: '12h' },
      { name: 'showSeconds', type: 'boolean', label: 'Show Seconds', defaultValue: false },
      { name: 'showDate', type: 'boolean', label: 'Show Date', defaultValue: true },
    ],
  },
  render: (widget, _data) => {
    const now = new Date();
    const format = widget.config.format as string || '12h';
    const showSeconds = widget.config.showSeconds as boolean;
    const showDate = widget.config.showDate as boolean;
    
    let hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    let ampm = '';
    
    if (format === '12h') {
      ampm = hours >= 12 ? ' PM' : ' AM';
      hours = hours % 12 || 12;
    }
    
    let time = `${hours}:${minutes}`;
    if (showSeconds) time += `:${seconds}`;
    time += ampm;
    
    let html = `<div class="widget-clock"><div class="time">${time}</div>`;
    if (showDate) {
      const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      html += `<div class="date">${date}</div>`;
    }
    html += '</div>';
    
    return html;
  },
};

export const weatherWidgetDefinition: WidgetDefinition = {
  type: 'weather',
  name: 'Weather',
  description: 'Current weather conditions',
  icon: 'weather',
  supportedSizes: ['small', 'medium', 'large'],
  defaultSize: 'medium',
  configSchema: {
    fields: [
      { name: 'location', type: 'string', label: 'Location', defaultValue: 'auto' },
      { name: 'units', type: 'select', label: 'Units', options: [
        { label: 'Celsius', value: 'metric' },
        { label: 'Fahrenheit', value: 'imperial' },
      ], defaultValue: 'metric' },
    ],
  },
  fetchData: async (_widget) => {
    // Simulated weather data
    return {
      temp: 22,
      condition: 'Partly Cloudy',
      icon: 'partly-cloudy',
      humidity: 65,
      wind: 12,
      forecast: [
        { day: 'Mon', high: 24, low: 18, icon: 'sunny' },
        { day: 'Tue', high: 22, low: 17, icon: 'partly-cloudy' },
        { day: 'Wed', high: 20, low: 15, icon: 'rain' },
      ],
    };
  },
  render: (widget, data) => {
    const weather = data as { temp: number; condition: string; icon: string } | undefined;
    if (!weather) return '<div class="widget-weather loading">Loading...</div>';
    
    const units = widget.config.units === 'imperial' ? '°F' : '°C';
    
    return `
      <div class="widget-weather">
        <div class="current">
          <span class="icon">${weather.icon}</span>
          <span class="temp">${weather.temp}${units}</span>
        </div>
        <div class="condition">${weather.condition}</div>
      </div>
    `;
  },
};

export const calendarWidgetDefinition: WidgetDefinition = {
  type: 'calendar',
  name: 'Calendar',
  description: 'Upcoming events',
  icon: 'calendar',
  supportedSizes: ['medium', 'large'],
  defaultSize: 'medium',
  fetchData: async () => {
    // Simulated calendar data
    return {
      today: new Date(),
      events: [
        { id: '1', title: 'Team Meeting', time: '10:00 AM', color: '#3B82F6' },
        { id: '2', title: 'Lunch with Alex', time: '12:30 PM', color: '#10B981' },
        { id: '3', title: 'Project Review', time: '3:00 PM', color: '#8B5CF6' },
      ],
    };
  },
  render: (_widget, data) => {
    const calendar = data as { events: Array<{ title: string; time: string; color: string }> } | undefined;
    if (!calendar) return '<div class="widget-calendar loading">Loading...</div>';
    
    const eventsHtml = calendar.events.map(e => `
      <div class="event" style="border-left-color: ${e.color}">
        <span class="time">${e.time}</span>
        <span class="title">${e.title}</span>
      </div>
    `).join('');
    
    return `<div class="widget-calendar"><div class="events">${eventsHtml}</div></div>`;
  },
};

export const notesWidgetDefinition: WidgetDefinition = {
  type: 'notes',
  name: 'Quick Notes',
  description: 'Sticky note widget',
  icon: 'notes',
  supportedSizes: ['small', 'medium', 'large'],
  defaultSize: 'medium',
  configSchema: {
    fields: [
      { name: 'content', type: 'string', label: 'Content', defaultValue: '' },
      { name: 'color', type: 'color', label: 'Color', defaultValue: '#FEF3C7' },
    ],
  },
  render: (widget) => {
    const content = widget.config.content as string || '';
    const color = widget.config.color as string || '#FEF3C7';
    
    return `
      <div class="widget-notes" style="background-color: ${color}">
        <div class="content">${content || 'Click to add notes...'}</div>
      </div>
    `;
  },
};

// ---------------------------------------------------------------------------
// 1231-1245. Widget Grid Layout
// ---------------------------------------------------------------------------

export interface WidgetGridCell {
  col: number;
  row: number;
  occupied: boolean;
  widgetId?: string;
}

export interface WidgetGridConfig {
  columns: number;
  rows: number;
  cellSize: number;
  gap: number;
}

export const defaultWidgetGridConfig: WidgetGridConfig = {
  columns: 8,
  rows: 6,
  cellSize: 90,
  gap: 10,
};

export class WidgetGrid {
  private grid: WidgetGridCell[][] = [];
  private config: WidgetGridConfig;
  
  constructor(config: Partial<WidgetGridConfig> = {}) {
    this.config = { ...defaultWidgetGridConfig, ...config };
    this.initializeGrid();
  }
  
  private initializeGrid(): void {
    this.grid = [];
    for (let row = 0; row < this.config.rows; row++) {
      this.grid[row] = [];
      for (let col = 0; col < this.config.columns; col++) {
        this.grid[row][col] = { col, row, occupied: false };
      }
    }
  }
  
  placeWidget(widget: Widget): { x: number; y: number } | null {
    const dimensions = widgetSizeDimensions[widget.size];
    const { cols, rows } = dimensions;
    
    // Find first available spot
    for (let row = 0; row <= this.config.rows - rows; row++) {
      for (let col = 0; col <= this.config.columns - cols; col++) {
        if (this.canPlace(col, row, cols, rows)) {
          this.occupy(col, row, cols, rows, widget.id);
          return this.gridToPixel(col, row);
        }
      }
    }
    
    return null; // No space available
  }
  
  private canPlace(col: number, row: number, cols: number, rows: number): boolean {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        if (r >= this.config.rows || c >= this.config.columns) return false;
        if (this.grid[r][c].occupied) return false;
      }
    }
    return true;
  }
  
  private occupy(col: number, row: number, cols: number, rows: number, widgetId: string): void {
    for (let r = row; r < row + rows; r++) {
      for (let c = col; c < col + cols; c++) {
        this.grid[r][c].occupied = true;
        this.grid[r][c].widgetId = widgetId;
      }
    }
  }
  
  removeWidget(widgetId: string): void {
    for (let row = 0; row < this.config.rows; row++) {
      for (let col = 0; col < this.config.columns; col++) {
        if (this.grid[row][col].widgetId === widgetId) {
          this.grid[row][col].occupied = false;
          this.grid[row][col].widgetId = undefined;
        }
      }
    }
  }
  
  gridToPixel(col: number, row: number): { x: number; y: number } {
    return {
      x: col * (this.config.cellSize + this.config.gap),
      y: row * (this.config.cellSize + this.config.gap),
    };
  }
  
  pixelToGrid(x: number, y: number): { col: number; row: number } {
    return {
      col: Math.floor(x / (this.config.cellSize + this.config.gap)),
      row: Math.floor(y / (this.config.cellSize + this.config.gap)),
    };
  }
  
  getOccupiedCells(): WidgetGridCell[] {
    const cells: WidgetGridCell[] = [];
    for (let row = 0; row < this.config.rows; row++) {
      for (let col = 0; col < this.config.columns; col++) {
        if (this.grid[row][col].occupied) {
          cells.push(this.grid[row][col]);
        }
      }
    }
    return cells;
  }
}


// =============================================================================
// QUICK ACTIONS (Items 1246-1275)
// =============================================================================

// ---------------------------------------------------------------------------
// 1246-1255. Quick Actions System
// ---------------------------------------------------------------------------

export interface QuickAction {
  id: string;
  title: string;
  subtitle?: string;
  icon: string;
  iconColor?: string;
  category: QuickActionCategory;
  isToggle?: boolean;
  toggleState?: boolean;
  execute: () => void | Promise<void>;
  getState?: () => Promise<boolean>;
  shortcut?: string;
  requiresConfirmation?: boolean;
}

export type QuickActionCategory =
  | 'connectivity'
  | 'display'
  | 'sound'
  | 'system'
  | 'accessibility'
  | 'power'
  | 'shortcuts';

export interface QuickActionGroup {
  category: QuickActionCategory;
  title: string;
  icon: string;
  actions: QuickAction[];
}

export class QuickActionsManager {
  private actions = new Map<string, QuickAction>();
  private listeners = new Set<(actions: QuickAction[]) => void>();
  
  register(action: QuickAction): void {
    this.actions.set(action.id, action);
    this.notifyListeners();
  }
  
  unregister(actionId: string): void {
    this.actions.delete(actionId);
    this.notifyListeners();
  }
  
  async execute(actionId: string): Promise<void> {
    const action = this.actions.get(actionId);
    if (!action) return;
    
    if (action.isToggle && action.getState) {
      const currentState = await action.getState();
      action.toggleState = !currentState;
    }
    
    await action.execute();
    this.notifyListeners();
  }
  
  async refreshState(actionId: string): Promise<void> {
    const action = this.actions.get(actionId);
    if (!action?.getState) return;
    
    action.toggleState = await action.getState();
    this.notifyListeners();
  }
  
  async refreshAllStates(): Promise<void> {
    const toggleActions = Array.from(this.actions.values()).filter(a => a.isToggle && a.getState);
    
    await Promise.all(toggleActions.map(async action => {
      action.toggleState = await action.getState!();
    }));
    
    this.notifyListeners();
  }
  
  getAction(actionId: string): QuickAction | undefined {
    return this.actions.get(actionId);
  }
  
  getAll(): QuickAction[] {
    return Array.from(this.actions.values());
  }
  
  getByCategory(category: QuickActionCategory): QuickAction[] {
    return Array.from(this.actions.values()).filter(a => a.category === category);
  }
  
  getGroups(): QuickActionGroup[] {
    const categoryInfo: Record<QuickActionCategory, { title: string; icon: string }> = {
      connectivity: { title: 'Connectivity', icon: 'net' },
      display: { title: 'Display', icon: 'display' },
      sound: { title: 'Sound', icon: 'sound' },
      system: { title: 'System', icon: 'system' },
      accessibility: { title: 'Accessibility', icon: 'access' },
      power: { title: 'Power', icon: 'power' },
      shortcuts: { title: 'Shortcuts', icon: 'keys' },
    };
    
    const groups = new Map<QuickActionCategory, QuickAction[]>();
    
    for (const action of this.actions.values()) {
      const category = action.category;
      if (!groups.has(category)) {
        groups.set(category, []);
      }
      groups.get(category)!.push(action);
    }
    
    return Array.from(groups.entries()).map(([category, actions]) => ({
      category,
      ...categoryInfo[category],
      actions,
    }));
  }
  
  onChange(listener: (actions: QuickAction[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notifyListeners(): void {
    const actions = this.getAll();
    for (const listener of this.listeners) {
      listener(actions);
    }
  }
}

// ---------------------------------------------------------------------------
// 1256-1265. Built-in Quick Actions
// ---------------------------------------------------------------------------

export function createBuiltInQuickActions(): QuickAction[] {
  return [
    // Connectivity
    {
      id: 'wifi',
      title: 'Wi-Fi',
      icon: 'wifi',
      category: 'connectivity',
      isToggle: true,
      toggleState: true,
      execute: () => { console.log('Toggle Wi-Fi'); },
      getState: async () => true,
    },
    {
      id: 'bluetooth',
      title: 'Bluetooth',
      icon: 'phone',
      category: 'connectivity',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Bluetooth'); },
      getState: async () => false,
    },
    {
      id: 'airplane',
      title: 'Airplane Mode',
      icon: 'airplane',
      category: 'connectivity',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Airplane Mode'); },
      getState: async () => false,
    },
    
    // Display
    {
      id: 'dark-mode',
      title: 'Dark Mode',
      icon: 'moon',
      category: 'display',
      isToggle: true,
      toggleState: true,
      execute: () => { document.documentElement.classList.toggle('dark'); },
      getState: async () => document.documentElement.classList.contains('dark'),
    },
    {
      id: 'night-shift',
      title: 'Night Shift',
      icon: 'sunrise',
      category: 'display',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Night Shift'); },
      getState: async () => false,
    },
    {
      id: 'screen-mirror',
      title: 'Screen Mirroring',
      icon: 'screen',
      category: 'display',
      execute: () => { console.log('Screen Mirror'); },
    },
    
    // Sound
    {
      id: 'mute',
      title: 'Mute',
      icon: 'mute',
      category: 'sound',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Mute'); },
      getState: async () => false,
    },
    {
      id: 'dnd',
      title: 'Do Not Disturb',
      icon: 'dnd',
      category: 'sound',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle DND'); },
      getState: async () => false,
    },
    
    // System
    {
      id: 'lock-screen',
      title: 'Lock Screen',
      icon: 'lock',
      category: 'system',
      execute: () => { console.log('Lock Screen'); },
      shortcut: 'Cmd+Ctrl+Q',
    },
    {
      id: 'screenshot',
      title: 'Screenshot',
      icon: 'camera',
      category: 'system',
      execute: () => { console.log('Screenshot'); },
      shortcut: 'Cmd+Shift+3',
    },
    {
      id: 'screen-record',
      title: 'Screen Recording',
      icon: 'record',
      category: 'system',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Screen Recording'); },
      getState: async () => false,
    },
    
    // Accessibility
    {
      id: 'zoom',
      title: 'Zoom',
      icon: 'zoom',
      category: 'accessibility',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Zoom'); },
      getState: async () => false,
    },
    {
      id: 'voice-over',
      title: 'VoiceOver',
      icon: 'voice',
      category: 'accessibility',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle VoiceOver'); },
      getState: async () => false,
    },
    
    // Power
    {
      id: 'low-power',
      title: 'Low Power Mode',
      icon: 'battery',
      category: 'power',
      isToggle: true,
      toggleState: false,
      execute: () => { console.log('Toggle Low Power Mode'); },
      getState: async () => false,
    },
  ];
}

// ---------------------------------------------------------------------------
// 1266-1275. Control Center Layout
// ---------------------------------------------------------------------------

export interface ControlCenterSection {
  id: string;
  title?: string;
  type: 'toggles' | 'sliders' | 'buttons' | 'custom';
  items: string[]; // Action IDs or custom items
  columns?: number;
  expandable?: boolean;
}

export interface ControlCenterConfig {
  sections: ControlCenterSection[];
  compactMode: boolean;
  showLabels: boolean;
  accentColor: string;
}

export const defaultControlCenterConfig: ControlCenterConfig = {
  sections: [
    {
      id: 'connectivity',
      type: 'toggles',
      items: ['wifi', 'bluetooth', 'airplane'],
      columns: 2,
    },
    {
      id: 'display-sound',
      type: 'toggles',
      items: ['dark-mode', 'mute', 'dnd'],
      columns: 3,
    },
    {
      id: 'brightness',
      type: 'sliders',
      items: ['brightness', 'volume'],
    },
    {
      id: 'shortcuts',
      type: 'buttons',
      items: ['screenshot', 'screen-record', 'lock-screen'],
      columns: 3,
    },
  ],
  compactMode: false,
  showLabels: true,
  accentColor: '#007AFF',
};

export interface SliderControl {
  id: string;
  label: string;
  icon: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}

export function createControlCenterSliders(): SliderControl[] {
  return [
    {
      id: 'brightness',
      label: 'Brightness',
      icon: 'brightness',
      value: 80,
      min: 0,
      max: 100,
      step: 1,
      onChange: (value) => {
        document.documentElement.style.setProperty('--screen-brightness', `${value}%`);
      },
    },
    {
      id: 'volume',
      label: 'Volume',
      icon: 'volume',
      value: 50,
      min: 0,
      max: 100,
      step: 1,
      onChange: (value) => {
        console.log('Volume:', value);
      },
    },
  ];
}

export function getControlCenterTileStyles(
  isActive: boolean,
  accentColor: string
): { background: string; color: string; boxShadow: string } {
  if (isActive) {
    return {
      background: accentColor,
      color: '#FFFFFF',
      boxShadow: `0 2px 8px ${accentColor}40`,
    };
  }
  
  return {
    background: 'var(--surface-secondary)',
    color: 'var(--text-primary)',
    boxShadow: 'none',
  };
}


// All exports are at declaration
