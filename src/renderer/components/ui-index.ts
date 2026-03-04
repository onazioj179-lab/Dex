/**
 * DEX UI Components Index
 * Export all shared UI components
 */

// Core System Features
export { 
  SystemFeatures, 
  useSessionAutoSave 
} from './SystemFeatures';
export { 
  initializeTheme, 
  toggleTheme, 
  getCurrentTheme,
  applyTheme,
  applyAccentColor 
} from './ThemeManager';

// Layout Components
export { PanelGroup, SplitPanel, CollapsiblePanel } from './Panels';
export { StatusBar, ZoomControl, usePerformanceMetrics } from './StatusBar';
export { Toolbar, FloatingToolbar } from './Toolbar';
export { Timeline } from './Timeline';

// Workspace Components
export { 
  WorkspaceSelector, 
  SaveWorkspaceDialog, 
  useWorkspace,
  WORKSPACE_PRESETS 
} from './WorkspacePanel';
export { 
  AssetBrowser, 
  CategorySidebar, 
  useAssetBrowser,
  ASSET_CATEGORIES,
  getAssetIcon,
  formatFileSize,
  formatDuration 
} from './AssetBrowser';
export { 
  MixerPanel, 
  ChannelStrip, 
  useMixer,
  CHANNEL_COLORS,
  dbToLinear,
  linearToDb,
  formatDb 
} from './MixerPanel';
export { 
  PreviewPanel, 
  TransportControls, 
  TimecodeDisplay, 
  SeekBar, 
  VolumeControl,
  PlaybackRateSelector,
  usePreview,
  formatTimecode,
  parseTimecode,
  PLAYBACK_RATES,
  ZOOM_LEVELS 
} from './PreviewPanel';
export { 
  InspectorPanel, 
  useInspector 
} from './InspectorPanel';

// Input Components
export { ColorPicker, DEFAULT_SWATCHES } from './ColorPicker';

// Re-export types
export type { StatusBarItem, SystemStatus } from './StatusBar';
export type { ToolbarItem, ToolbarGroup } from './Toolbar';
export type { PanelConfig, PanelState } from './Panels';
export type { 
  TimelineTrack, 
  TimelineClip, 
  TimelineMarker, 
  TimelineState 
} from './Timeline';
export type { ColorValue, ColorSwatch } from './ColorPicker';
export type { ThemePreset } from './ThemeManager';
export type { WorkspaceLayout, WorkspacePreset } from './WorkspacePanel';
export type { Asset, AssetType, AssetCategory, AssetFilter } from './AssetBrowser';
export type { MixerChannel, SendLevel, MixerState } from './MixerPanel';
export type { PreviewState, PreviewSettings } from './PreviewPanel';
export type { Property, PropertyType, PropertyGroup, InspectorState } from './InspectorPanel';

