/**
 * DEX VINX Video Editor Feature Enhancements
 * Ripple Edit, Tools, Export Queue, Clip Operations
 */

// ==================== EDIT MODE TYPES ====================
export type EditMode = 
  | 'select'      // Default selection tool
  | 'razor'       // Cut/split clips
  | 'ripple'      // Ripple edit mode
  | 'slip'        // Slip content within clip
  | 'slide'       // Slide clip between neighbors
  | 'roll'        // Roll edit point between clips
  | 'rate-stretch'// Change clip speed by dragging
  | 'hand'        // Pan timeline view
  | 'zoom';       // Zoom timeline

export interface EditTool {
  id: EditMode;
  name: string;
  shortcut: string;
  description: string;
  icon: string;
}

export const EDIT_TOOLS: EditTool[] = [
  { id: 'select', name: 'Selection', shortcut: 'V', description: 'Select and move clips', icon: 'pointer' },
  { id: 'razor', name: 'Razor', shortcut: 'C', description: 'Cut clips at cursor', icon: 'scissors' },
  { id: 'ripple', name: 'Ripple Edit', shortcut: 'B', description: 'Edit and shift adjacent clips', icon: 'ripple' },
  { id: 'slip', name: 'Slip', shortcut: 'Y', description: 'Slip clip content', icon: 'slip' },
  { id: 'slide', name: 'Slide', shortcut: 'U', description: 'Slide clip position', icon: 'slide' },
  { id: 'roll', name: 'Roll', shortcut: 'N', description: 'Roll edit point', icon: 'roll' },
  { id: 'rate-stretch', name: 'Rate Stretch', shortcut: 'R', description: 'Change clip speed', icon: 'stretch' },
  { id: 'hand', name: 'Hand', shortcut: 'H', description: 'Pan timeline view', icon: 'hand' },
  { id: 'zoom', name: 'Zoom', shortcut: 'Z', description: 'Zoom timeline', icon: 'zoom' },
];

// ==================== TRACK TARGETING ====================
export interface TrackTarget {
  trackId: string;
  videoEnabled: boolean;
  audioEnabled: boolean;
}

// ==================== EXPORT QUEUE ====================
export interface ExportJob {
  id: string;
  name: string;
  projectId: string;
  settings: ExportSettings;
  status: 'queued' | 'rendering' | 'completed' | 'failed' | 'paused';
  progress: number;
  startTime?: number;
  endTime?: number;
  outputPath: string;
  errorMessage?: string;
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm' | 'gif' | 'avi' | 'mkv';
  codec: 'h264' | 'h265' | 'prores' | 'vp9' | 'av1';
  resolution: VideoResolution;
  frameRate: number;
  bitrate: number; // kbps
  audioBitrate: number; // kbps
  audioCodec: 'aac' | 'mp3' | 'opus' | 'pcm';
  quality: 'draft' | 'preview' | 'normal' | 'high' | 'maximum';
}

export interface VideoResolution {
  width: number;
  height: number;
  name: string;
}

export const VIDEO_RESOLUTIONS: VideoResolution[] = [
  { width: 1920, height: 1080, name: '1080p Full HD' },
  { width: 3840, height: 2160, name: '4K UHD' },
  { width: 2560, height: 1440, name: '1440p QHD' },
  { width: 1280, height: 720, name: '720p HD' },
  { width: 854, height: 480, name: '480p SD' },
  { width: 640, height: 360, name: '360p' },
  { width: 1080, height: 1920, name: '1080x1920 Vertical' },
  { width: 1080, height: 1080, name: '1080x1080 Square' },
  { width: 1200, height: 628, name: 'Facebook Cover' },
  { width: 1280, height: 720, name: 'YouTube Thumbnail' },
];

export const EXPORT_PRESETS: { id: string; name: string; settings: Partial<ExportSettings> }[] = [
  { id: 'youtube', name: 'YouTube 1080p', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[0], frameRate: 30, bitrate: 8000, audioBitrate: 256, quality: 'high' } },
  { id: 'youtube-4k', name: 'YouTube 4K', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[1], frameRate: 30, bitrate: 35000, audioBitrate: 320, quality: 'maximum' } },
  { id: 'instagram', name: 'Instagram Reels', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[6], frameRate: 30, bitrate: 6000, audioBitrate: 192, quality: 'high' } },
  { id: 'tiktok', name: 'TikTok', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[6], frameRate: 30, bitrate: 5000, audioBitrate: 192, quality: 'normal' } },
  { id: 'twitter', name: 'Twitter/X', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[0], frameRate: 30, bitrate: 5000, audioBitrate: 192, quality: 'normal' } },
  { id: 'web', name: 'Web Optimized', settings: { format: 'webm', codec: 'vp9', resolution: VIDEO_RESOLUTIONS[0], frameRate: 30, bitrate: 4000, audioBitrate: 128, quality: 'normal' } },
  { id: 'gif', name: 'GIF Animation', settings: { format: 'gif', codec: 'h264', resolution: VIDEO_RESOLUTIONS[3], frameRate: 15, bitrate: 0, audioBitrate: 0, quality: 'preview' } },
  { id: 'prores', name: 'ProRes Master', settings: { format: 'mov', codec: 'prores', resolution: VIDEO_RESOLUTIONS[0], frameRate: 24, bitrate: 100000, audioBitrate: 320, quality: 'maximum' } },
  { id: 'draft', name: 'Quick Preview', settings: { format: 'mp4', codec: 'h264', resolution: VIDEO_RESOLUTIONS[4], frameRate: 24, bitrate: 1500, audioBitrate: 128, quality: 'draft' } },
  { id: 'archive', name: 'Archive Quality', settings: { format: 'mkv', codec: 'h265', resolution: VIDEO_RESOLUTIONS[1], frameRate: 30, bitrate: 50000, audioBitrate: 320, quality: 'maximum' } },
];

// ==================== CLIP OPERATIONS ====================
export interface ClipAttributes {
  speed: number;
  volume: number;
  opacity: number;
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  filters: FilterConfig[];
  transitions: { in?: TransitionConfig; out?: TransitionConfig };
}

export interface FilterConfig {
  id: string;
  type: string;
  enabled: boolean;
  params: Record<string, number | string>;
}

export interface TransitionConfig {
  type: string;
  duration: number;
  params?: Record<string, number>;
}

// Paste attributes options
export interface PasteAttributesOptions {
  speed: boolean;
  volume: boolean;
  opacity: boolean;
  position: boolean;
  scale: boolean;
  rotation: boolean;
  filters: boolean;
  transitions: boolean;
}

// ==================== FREEZE FRAME ====================
export interface FreezeFrame {
  sourceClipId: string;
  timeCode: number;
  duration: number;
}

// ==================== NESTED SEQUENCE ====================
export interface NestedSequence {
  id: string;
  name: string;
  sourceSequenceId: string;
  duration: number;
  color: string;
}

// ==================== MAGNETIC TIMELINE ====================
export interface MagneticSettings {
  enabled: boolean;
  snapToClips: boolean;
  snapToMarkers: boolean;
  snapToPlayhead: boolean;
  snapDistance: number; // pixels
  rippleOnDrag: boolean;
}

export const DEFAULT_MAGNETIC_SETTINGS: MagneticSettings = {
  enabled: true,
  snapToClips: true,
  snapToMarkers: true,
  snapToPlayhead: true,
  snapDistance: 10,
  rippleOnDrag: false,
};

// ==================== IN/OUT POINTS ====================
export interface InOutPoints {
  inPoint: number | null;
  outPoint: number | null;
}

// ==================== FIT TO FILL ====================
export interface FitToFillSettings {
  targetDuration: number;
  method: 'speed' | 'trim' | 'freeze';
  maintainPitch: boolean;
}

// ==================== VIDEO FILTERS ====================
export const VIDEO_FILTERS = [
  // Color Correction
  { id: 'brightness', name: 'Brightness', category: 'color', params: [{ key: 'value', label: 'Brightness', min: -100, max: 100, default: 0 }] },
  { id: 'contrast', name: 'Contrast', category: 'color', params: [{ key: 'value', label: 'Contrast', min: -100, max: 100, default: 0 }] },
  { id: 'saturation', name: 'Saturation', category: 'color', params: [{ key: 'value', label: 'Saturation', min: -100, max: 100, default: 0 }] },
  { id: 'hue', name: 'Hue Shift', category: 'color', params: [{ key: 'value', label: 'Hue', min: -180, max: 180, default: 0 }] },
  { id: 'temperature', name: 'Temperature', category: 'color', params: [{ key: 'value', label: 'Temp', min: -100, max: 100, default: 0 }] },
  { id: 'tint', name: 'Tint', category: 'color', params: [{ key: 'value', label: 'Tint', min: -100, max: 100, default: 0 }] },
  { id: 'exposure', name: 'Exposure', category: 'color', params: [{ key: 'value', label: 'EV', min: -3, max: 3, default: 0 }] },
  { id: 'gamma', name: 'Gamma', category: 'color', params: [{ key: 'value', label: 'Gamma', min: 0.1, max: 4, default: 1 }] },
  
  // Stylize
  { id: 'blur', name: 'Gaussian Blur', category: 'stylize', params: [{ key: 'radius', label: 'Radius', min: 0, max: 100, default: 0 }] },
  { id: 'sharpen', name: 'Sharpen', category: 'stylize', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, default: 0 }] },
  { id: 'vignette', name: 'Vignette', category: 'stylize', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 0 }, { key: 'size', label: 'Size', min: 0, max: 100, default: 50 }] },
  { id: 'noise', name: 'Film Grain', category: 'stylize', params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, default: 0 }] },
  { id: 'glitch', name: 'Glitch', category: 'stylize', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 50 }] },
  { id: 'chromatic', name: 'Chromatic Aberration', category: 'stylize', params: [{ key: 'amount', label: 'Amount', min: 0, max: 50, default: 0 }] },
  
  // LUT/Looks
  { id: 'lut-cinematic', name: 'Cinematic', category: 'looks', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 100 }] },
  { id: 'lut-vintage', name: 'Vintage', category: 'looks', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 100 }] },
  { id: 'lut-bw', name: 'Black & White', category: 'looks', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 100 }] },
  { id: 'lut-teal-orange', name: 'Teal & Orange', category: 'looks', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 100 }] },
  { id: 'lut-moody', name: 'Moody', category: 'looks', params: [{ key: 'intensity', label: 'Intensity', min: 0, max: 100, default: 100 }] },
];

// ==================== VIDEO TRANSITIONS ====================
export const VIDEO_TRANSITIONS = [
  // Basic
  { id: 'cut', name: 'Cut', category: 'basic', defaultDuration: 0 },
  { id: 'dissolve', name: 'Cross Dissolve', category: 'basic', defaultDuration: 30 },
  { id: 'fade-black', name: 'Fade to Black', category: 'basic', defaultDuration: 30 },
  { id: 'fade-white', name: 'Fade to White', category: 'basic', defaultDuration: 30 },
  
  // Wipes
  { id: 'wipe-left', name: 'Wipe Left', category: 'wipes', defaultDuration: 30 },
  { id: 'wipe-right', name: 'Wipe Right', category: 'wipes', defaultDuration: 30 },
  { id: 'wipe-up', name: 'Wipe Up', category: 'wipes', defaultDuration: 30 },
  { id: 'wipe-down', name: 'Wipe Down', category: 'wipes', defaultDuration: 30 },
  { id: 'wipe-diagonal', name: 'Diagonal Wipe', category: 'wipes', defaultDuration: 30 },
  { id: 'wipe-clock', name: 'Clock Wipe', category: 'wipes', defaultDuration: 30 },
  
  // Slides
  { id: 'slide-left', name: 'Slide Left', category: 'slides', defaultDuration: 30 },
  { id: 'slide-right', name: 'Slide Right', category: 'slides', defaultDuration: 30 },
  { id: 'slide-up', name: 'Slide Up', category: 'slides', defaultDuration: 30 },
  { id: 'slide-down', name: 'Slide Down', category: 'slides', defaultDuration: 30 },
  { id: 'push-left', name: 'Push Left', category: 'slides', defaultDuration: 30 },
  { id: 'push-right', name: 'Push Right', category: 'slides', defaultDuration: 30 },
  
  // Zoom
  { id: 'zoom-in', name: 'Zoom In', category: 'zoom', defaultDuration: 30 },
  { id: 'zoom-out', name: 'Zoom Out', category: 'zoom', defaultDuration: 30 },
  { id: 'zoom-blur', name: 'Zoom Blur', category: 'zoom', defaultDuration: 30 },
  
  // 3D
  { id: 'cube-left', name: 'Cube Left', category: '3d', defaultDuration: 30 },
  { id: 'cube-right', name: 'Cube Right', category: '3d', defaultDuration: 30 },
  { id: 'flip', name: 'Flip', category: '3d', defaultDuration: 30 },
  { id: 'spin', name: 'Spin', category: '3d', defaultDuration: 30 },
  
  // Stylized
  { id: 'glitch-trans', name: 'Glitch', category: 'stylized', defaultDuration: 15 },
  { id: 'flash', name: 'Flash', category: 'stylized', defaultDuration: 10 },
  { id: 'shake', name: 'Shake', category: 'stylized', defaultDuration: 20 },
  { id: 'luma-fade', name: 'Luma Fade', category: 'stylized', defaultDuration: 30 },
];

// ==================== KEYBOARD SHORTCUTS ====================
export const VIDEO_SHORTCUTS = {
  // Playback
  'space': 'Play/Pause',
  'k': 'Stop',
  'j': 'Shuttle Left',
  'l': 'Shuttle Right',
  'left': 'Previous Frame',
  'right': 'Next Frame',
  'shift+left': 'Previous Second',
  'shift+right': 'Next Second',
  'home': 'Go to Start',
  'end': 'Go to End',
  
  // Edit
  'i': 'Mark In',
  'o': 'Mark Out',
  'x': 'Mark Clip',
  '/': 'Clear In/Out',
  ';': 'Lift',
  "'": 'Extract',
  ',': 'Insert',
  '.': 'Overwrite',
  'delete': 'Ripple Delete',
  'backspace': 'Delete',
  
  // Tools
  'v': 'Selection Tool',
  'c': 'Razor Tool',
  'b': 'Ripple Edit',
  'y': 'Slip Tool',
  'u': 'Slide Tool',
  'n': 'Roll Edit',
  'r': 'Rate Stretch',
  'h': 'Hand Tool',
  'z': 'Zoom Tool',
  
  // Timeline
  '=': 'Zoom In',
  '-': 'Zoom Out',
  '\\': 'Fit to Window',
  's': 'Snap Toggle',
  'shift+s': 'Solo Track',
  'm': 'Add Marker',
  
  // Clips
  'ctrl+d': 'Duplicate',
  'ctrl+g': 'Group',
  'ctrl+shift+g': 'Ungroup',
  'alt+up': 'Move Clip Up',
  'alt+down': 'Move Clip Down',
  'f': 'Match Frame',
};

// ==================== UTILITY FUNCTIONS ====================

// Generate unique ID
export const generateId = (prefix: string = 'id'): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Format timecode
export const formatTimecode = (frames: number, fps: number = 30): string => {
  const totalSeconds = frames / fps;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const remainingFrames = Math.floor(frames % fps);
  
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${remainingFrames.toString().padStart(2, '0')}`;
};

// Parse timecode to frames
export const parseTimecode = (timecode: string, fps: number = 30): number => {
  const parts = timecode.split(':').map(Number);
  if (parts.length !== 4) return 0;
  const [hours, minutes, seconds, frames] = parts;
  return (hours * 3600 + minutes * 60 + seconds) * fps + frames;
};

// Calculate clip duration
export const calculateDuration = (inPoint: number, outPoint: number): number => {
  return Math.max(0, outPoint - inPoint);
};

// Save export queue
export const saveExportQueue = (jobs: ExportJob[]) => {
  try {
    localStorage.setItem('dex-video-export-queue', JSON.stringify(jobs));
  } catch { /* storage unavailable */ }
};

// Load export queue
export const loadExportQueue = (): ExportJob[] => {
  try {
    const saved = localStorage.getItem('dex-video-export-queue');
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
};

// Copy clip attributes
export const copyClipAttributes = (clip: { attributes: ClipAttributes }): ClipAttributes => {
  return JSON.parse(JSON.stringify(clip.attributes));
};

// Paste clip attributes
export const pasteClipAttributes = (
  source: ClipAttributes,
  target: ClipAttributes,
  options: PasteAttributesOptions
): ClipAttributes => {
  const result = { ...target };
  
  if (options.speed) result.speed = source.speed;
  if (options.volume) result.volume = source.volume;
  if (options.opacity) result.opacity = source.opacity;
  if (options.position) result.position = { ...source.position };
  if (options.scale) result.scale = { ...source.scale };
  if (options.rotation) result.rotation = source.rotation;
  if (options.filters) result.filters = [...source.filters];
  if (options.transitions) result.transitions = { ...source.transitions };
  
  return result;
};

// Snap to nearest point
export const snapToPoint = (
  value: number,
  snapPoints: number[],
  snapDistance: number
): number => {
  for (const point of snapPoints) {
    if (Math.abs(value - point) <= snapDistance) {
      return point;
    }
  }
  return value;
};

// Calculate ripple offset
export const calculateRippleOffset = (
  clips: { id: string; startTime: number; duration: number }[],
  editedClipId: string,
  newDuration: number
): Map<string, number> => {
  const offsets = new Map<string, number>();
  const editedClip = clips.find(c => c.id === editedClipId);
  if (!editedClip) return offsets;
  
  const durationChange = newDuration - editedClip.duration;
  
  for (const clip of clips) {
    if (clip.startTime > editedClip.startTime + editedClip.duration) {
      offsets.set(clip.id, durationChange);
    }
  }
  
  return offsets;
};

export default {
  EDIT_TOOLS,
  VIDEO_RESOLUTIONS,
  EXPORT_PRESETS,
  VIDEO_FILTERS,
  VIDEO_TRANSITIONS,
  VIDEO_SHORTCUTS,
  DEFAULT_MAGNETIC_SETTINGS,
  generateId,
  formatTimecode,
  parseTimecode,
  calculateDuration,
  saveExportQueue,
  loadExportQueue,
  copyClipAttributes,
  pasteClipAttributes,
  snapToPoint,
  calculateRippleOffset,
};
