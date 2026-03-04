/**
 * DEX Application Features Index
 * Export all feature modules for creative apps
 */

// Imosion DAW Features
export {
  REGION_TYPES,
  TRACK_TEMPLATES,
  CLIP_COLORS,
  WAVEFORM_ZOOM_PRESETS,
  COMMON_TIME_SIGNATURES,
  DEFAULT_METRONOME,
  DEFAULT_PUNCH,
  DEFAULT_LOOP_RECORDING,
  generateId as generateImosionId,
  barsToSeconds,
  secondsToBars,
  formatTime as formatImosionTime,
  formatBarPosition,
} from './ImosionFeatures';

export type {
  Marker,
  Region,
  TrackTemplate,
  TrackGroup,
  MetronomeSettings,
  PunchSettings,
  LoopRecordingSettings,
  TimeSignatureChange,
  TempoPoint,
  TrackNote,
  ReferenceTrack,
} from './ImosionFeatures';

// Video Editor Features
export {
  EDIT_TOOLS,
  VIDEO_RESOLUTIONS,
  EXPORT_PRESETS,
  VIDEO_FILTERS,
  VIDEO_TRANSITIONS,
  VIDEO_SHORTCUTS,
  DEFAULT_MAGNETIC_SETTINGS,
  generateId as generateVideoId,
  formatTimecode,
  parseTimecode,
  calculateDuration,
  copyClipAttributes,
  pasteClipAttributes,
  snapToPoint,
  calculateRippleOffset,
  saveExportQueue,
  loadExportQueue,
} from './VideoEditorFeatures';

export type {
  EditMode,
  EditTool,
  ExportJob,
  ExportSettings,
  ClipAttributes,
  MagneticSettings,
  InOutPoints,
} from './VideoEditorFeatures';

// Prism Image Editor Features
export {
  DEFAULT_GUIDE_SETTINGS,
  ROTATION_PRESETS,
  ADJUSTMENT_PRESETS,
  QUICK_EXPORT_PRESETS,
  BATCH_RESIZE_PRESETS,
  generateId as generatePrismId,
  hexToRgb as prismHexToRgb,
  rgbToHex as prismRgbToHex,
  rgbToHsl as prismRgbToHsl,
  calculateHistogram,
  extractDominantColors,
  calculateSnapPosition,
  convertUnits,
} from './PrismFeatures';

export type {
  SmartGuide,
  GuideSettings,
  PixelGridSettings,
  CanvasRotation,
  EditHistory,
  AdjustmentLayer,
  AdjustmentType,
  LayerMask,
  QuickExportSettings,
  BatchOperation,
  CompareSettings,
  HistogramData,
  ColorPalette,
} from './PrismFeatures';

// Flux Motion Graphics Features
export {
  EASING_PRESETS,
  DEFAULT_GRAPH_SETTINGS,
  MORPH_SHAPES,
  DEFAULT_PATH_ANIMATION,
  EXPRESSION_TEMPLATES,
  EFFECT_DEFAULTS,
  COMPOSITION_PRESETS,
  generateId as generateFluxId,
  cubicBezier,
  getEasingFunction,
  interpolate,
  getPointOnPath,
  morphPaths,
  saveCustomEasings,
  loadCustomEasings,
  getAllEasings,
} from './FluxFeatures';

export type {
  EasingPreset,
  GraphEditorSettings,
  GraphKeyframe,
  KeyframeHandle,
  MorphSettings,
  PathData,
  PathPoint,
  PathAnimation,
  PathAnimationSettings,
  Expression,
  LayerEffect,
  EffectType,
  CompositionSettings,
} from './FluxFeatures';

// Forge Media Encoder Features
export {
  VIDEO_PRESETS,
  AUDIO_PRESETS,
  IMAGE_PRESETS,
  DEFAULT_QUEUE_SETTINGS,
  NAMING_TOKENS,
  GPU_ENCODERS,
  generateId as generateForgeId,
  formatFileSize,
  formatDuration,
  estimateEncodingTime,
  applyNamingPattern,
  getAllPresets,
  saveCustomPresets,
  loadCustomPresets,
  saveQueue,
  loadQueue,
  saveQueueSettings,
  loadQueueSettings,
} from './ForgeFeatures';

export type {
  EncodingPreset,
  EncodingSettings,
  QueueJob,
  QueueSettings,
  WatchFolder,
  HardwareInfo,
} from './ForgeFeatures';
