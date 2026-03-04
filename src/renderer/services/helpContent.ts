/**
 * DEX Help Content — Structured help data for every inner app.
 * guide: step-by-step instructions.
 * shortcuts: keyboard reference.
 */

export interface HelpGuideEntry {
  title: string;
  body: string;
}

export interface HelpShortcut {
  key: string;
  action: string;
}

export interface AppHelpContent {
  appId: string;
  displayName: string;
  guide: HelpGuideEntry[];
  shortcuts: HelpShortcut[];
}

const HELP: Record<string, AppHelpContent> = {
  videoeditor: {
    appId: 'videoeditor',
    displayName: 'VINX Video Editor',
    guide: [
      { title: 'Import media', body: 'Click the Import button or drag files into the media panel. Supported: MP4, MOV, WEBM, MP3, WAV, PNG, JPG.' },
      { title: 'Add to timeline', body: 'Double-click a clip in the media pool to append it to the first matching track. Drag to a specific track for precise placement.' },
      { title: 'Trim clips', body: 'Hover the edges of a clip in the timeline and drag the trim handles left or right.' },
      { title: 'Split a clip', body: 'Select a clip, position the playhead, then press C or use the Cut tool (B).' },
      { title: 'Add text', body: 'Switch to the Text panel on the left sidebar. Enter text, choose font and animation, then position on canvas.' },
      { title: 'Color grading', body: 'Open the Lumetri Color panel. Adjust Temperature, Tint, Exposure, Contrast, and use Color Wheels for creative looks.' },
      { title: 'Export', body: 'Click the green Export button. Choose a preset or customise format, resolution, frame rate and bitrate. Click Export to render.' },
      { title: 'Scene split', body: 'Right-click a clip to detect scene boundaries. Preview detected splits, then confirm to auto-split the clip.' },
    ],
    shortcuts: [
      { key: 'Space', action: 'Play / Pause' },
      { key: 'V', action: 'Select tool' },
      { key: 'C', action: 'Cut at playhead' },
      { key: 'B', action: 'Razor (Cut) tool' },
      { key: 'Z', action: 'Zoom tool' },
      { key: 'J / K / L', action: 'Shuttle reverse / pause / forward' },
      { key: 'I / O', action: 'Mark In / Out point' },
      { key: 'Left / Right', action: 'Seek 1 second' },
      { key: 'Shift+Left / Right', action: 'Seek 5 seconds' },
      { key: 'Home / End', action: 'Go to start / end' },
      { key: 'M', action: 'Add marker' },
      { key: 'Delete', action: 'Delete selected' },
      { key: 'Ctrl+Z', action: 'Undo' },
      { key: 'Ctrl+Shift+Z', action: 'Redo' },
      { key: 'Ctrl+S', action: 'Save / Export' },
      { key: 'Ctrl+C', action: 'Split clip at playhead' },
      { key: 'Ctrl+D', action: 'Duplicate clip' },
      { key: 'Ctrl+A', action: 'Select all clips' },
      { key: '+ / -', action: 'Zoom in / out timeline' },
    ],
  },
  imosion: {
    appId: 'imosion',
    displayName: 'Imosion DAW',
    guide: [
      { title: 'Add a track', body: 'Click the + button to add an Audio, Instrument, or Aux track.' },
      { title: 'Record audio', body: 'Arm a track by clicking the R button, then press the Record button or press R.' },
      { title: 'Import audio', body: 'Drag an audio file into the arrangement or use the Import button.' },
      { title: 'Mixer', body: 'Switch to the Mixer tab to adjust volume, pan, mute, solo, and add channel effects.' },
      { title: 'Metronome', body: 'Toggle the metronome with the M key or the metronome icon. Set tempo in the transport bar.' },
      { title: 'Export', body: 'Click Export to render your session as WAV, AIFF, MP3, or FLAC.' },
    ],
    shortcuts: [
      { key: 'Space', action: 'Play / Pause' },
      { key: 'R', action: 'Record' },
      { key: 'M', action: 'Toggle metronome' },
      { key: 'Ctrl+Z', action: 'Undo' },
      { key: 'Ctrl+Shift+Z', action: 'Redo' },
      { key: 'Delete', action: 'Delete selected region' },
      { key: 'Ctrl+S', action: 'Save session' },
    ],
  },
  prism: {
    appId: 'prism',
    displayName: 'Prism Image Editor',
    guide: [
      { title: 'Open an image', body: 'Click Open Image or drag a file onto the canvas. Supported: PNG, JPG, WEBP, TIFF, BMP.' },
      { title: 'Draw', body: 'Select the Brush tool (B) and paint on the canvas. Adjust size with [ / ] keys.' },
      { title: 'Selection', body: 'Use the rectangular or lasso selection tool to isolate an area for editing.' },
      { title: 'Layers', body: 'Add, remove, and reorder layers in the Layers panel. Toggle visibility with the eye icon.' },
      { title: 'Filters', body: 'Apply blur, sharpen, noise, posterize, threshold and more from the Filters panel.' },
      { title: 'Export', body: 'Click Export and choose PNG, JPG, WEBP, TIFF, or BMP. Adjust quality for lossy formats.' },
    ],
    shortcuts: [
      { key: 'V', action: 'Move tool' },
      { key: 'B', action: 'Brush' },
      { key: 'E', action: 'Eraser' },
      { key: 'G', action: 'Gradient' },
      { key: 'P', action: 'Pen' },
      { key: '[ / ]', action: 'Decrease / Increase brush size' },
      { key: 'Ctrl+Z', action: 'Undo' },
      { key: 'Ctrl+Shift+Z', action: 'Redo' },
      { key: 'Ctrl+T', action: 'Transform' },
    ],
  },
  flux: {
    appId: 'flux',
    displayName: 'Flux Motion Graphics',
    guide: [
      { title: 'Add a layer', body: 'Use the + button to add Shape, Text, Image, or Solid layers to the composition.' },
      { title: 'Animate', body: 'Select a layer, move the playhead, and change a property (position, scale, rotation, opacity) to create keyframes.' },
      { title: 'Timeline', body: 'Use the timeline to scrub, zoom, and arrange layer durations.' },
      { title: 'Preview', body: 'Press Space to preview the composition in the canvas.' },
      { title: 'Export', body: 'Click the Export button to render the composition as MP4, GIF, or image sequence.' },
    ],
    shortcuts: [
      { key: 'Space', action: 'Preview' },
      { key: 'T', action: 'Add text layer' },
      { key: 'Ctrl+Z', action: 'Undo' },
      { key: 'Ctrl+Shift+Z', action: 'Redo' },
      { key: '+ / -', action: 'Zoom timeline' },
    ],
  },
  forge: {
    appId: 'forge',
    displayName: 'Forge Encoder',
    guide: [
      { title: 'Add files', body: 'Click Add Files or drag video/audio files into the queue.' },
      { title: 'Choose preset', body: 'Select an output preset (H.264, HEVC, ProRes, etc.) from the dropdown.' },
      { title: 'Start encoding', body: 'Click Start or press Enter to begin encoding all queued items.' },
      { title: 'Monitor progress', body: 'Watch the progress bar and estimated time remaining for each item.' },
    ],
    shortcuts: [
      { key: 'Enter', action: 'Start encoding' },
      { key: 'Delete', action: 'Remove from queue' },
      { key: 'Ctrl+A', action: 'Select all' },
    ],
  },
  rewind: {
    appId: 'rewind',
    displayName: 'Rewind',
    guide: [
      { title: 'Overview', body: 'Rewind captures your screen activity and lets you search through past moments.' },
      { title: 'Search', body: 'Type a keyword in the search bar to find moments where that text appeared on screen.' },
      { title: 'Timeline', body: 'Scroll through the visual timeline to browse captured frames chronologically.' },
    ],
    shortcuts: [
      { key: 'Ctrl+F', action: 'Search' },
      { key: 'Esc', action: 'Close search' },
    ],
  },
  files: {
    appId: 'files',
    displayName: 'Files',
    guide: [
      { title: 'Browse', body: 'Navigate folder trees in the sidebar. Click a folder to see its contents.' },
      { title: 'Open files', body: 'Double-click a file to open it in the appropriate DEX app.' },
      { title: 'Context menu', body: 'Right-click for rename, delete, copy path, and other operations.' },
    ],
    shortcuts: [
      { key: 'Ctrl+N', action: 'New file' },
      { key: 'Ctrl+Shift+N', action: 'New folder' },
      { key: 'Delete', action: 'Delete selected' },
      { key: 'F2', action: 'Rename' },
    ],
  },
  browser: {
    appId: 'browser',
    displayName: 'Browser',
    guide: [
      { title: 'Navigate', body: 'Type a URL in the address bar and press Enter. Use back/forward buttons.' },
      { title: 'Tabs', body: 'Click + to open a new tab. Click a tab to switch. Middle-click to close.' },
      { title: 'Bookmarks', body: 'Click the bookmark icon to save the current page.' },
    ],
    shortcuts: [
      { key: 'Ctrl+T', action: 'New tab' },
      { key: 'Ctrl+W', action: 'Close tab' },
      { key: 'Ctrl+L', action: 'Focus address bar' },
      { key: 'Ctrl+R', action: 'Reload page' },
    ],
  },
  notes: {
    appId: 'notes',
    displayName: 'Notes',
    guide: [
      { title: 'Create a note', body: 'Click + to create a new note.' },
      { title: 'Format text', body: 'Use the toolbar for Bold, Italic, Headings, Lists, and Code blocks.' },
      { title: 'Markdown preview', body: 'Toggle the preview pane to see rendered Markdown.' },
    ],
    shortcuts: [
      { key: 'Ctrl+B', action: 'Bold' },
      { key: 'Ctrl+I', action: 'Italic' },
      { key: 'Ctrl+N', action: 'New note' },
    ],
  },
  tasks: {
    appId: 'tasks',
    displayName: 'Tasks',
    guide: [
      { title: 'Add a task', body: 'Type in the input field and press Enter or click Add.' },
      { title: 'Complete', body: 'Click the checkbox to mark a task as done.' },
      { title: 'Organise', body: 'Use lists/categories to group related tasks.' },
    ],
    shortcuts: [
      { key: 'Enter', action: 'Add task' },
      { key: 'Delete', action: 'Remove task' },
    ],
  },
  audio: {
    appId: 'audio',
    displayName: 'Audio Player',
    guide: [
      { title: 'Library', body: 'Your imported audio files appear in the library sidebar.' },
      { title: 'Playback', body: 'Click a track to play. Use transport controls for skip, shuffle, and repeat.' },
      { title: 'Volume', body: 'Drag the volume slider or use keyboard shortcuts.' },
    ],
    shortcuts: [
      { key: 'Space', action: 'Play / Pause' },
      { key: 'Left / Right', action: 'Previous / Next track' },
      { key: 'Up / Down', action: 'Volume up / down' },
    ],
  },
  video: {
    appId: 'video',
    displayName: 'Video Player',
    guide: [
      { title: 'Library', body: 'Browse your video collection in the sidebar.' },
      { title: 'Playback', body: 'Click a video to play. Double-click the player for fullscreen.' },
      { title: 'Seek', body: 'Click the progress bar or use arrow keys to seek.' },
    ],
    shortcuts: [
      { key: 'Space', action: 'Play / Pause' },
      { key: 'F', action: 'Toggle fullscreen' },
      { key: 'Left / Right', action: 'Seek 10 seconds' },
    ],
  },
  gallery: {
    appId: 'gallery',
    displayName: 'Gallery',
    guide: [
      { title: 'Browse', body: 'View images in Grid or List mode. Click to open in lightbox.' },
      { title: 'Import', body: 'Drag images into the Gallery or use the Import button.' },
      { title: 'Lightbox', body: 'Use arrow keys to navigate between images. Press Esc to close.' },
    ],
    shortcuts: [
      { key: 'Left / Right', action: 'Previous / Next image' },
      { key: 'Esc', action: 'Close lightbox' },
      { key: 'G', action: 'Grid view' },
      { key: 'L', action: 'List view' },
    ],
  },
  transfers: {
    appId: 'transfers',
    displayName: 'Transfers',
    guide: [
      { title: 'Send files', body: 'Drag files to the drop zone or click Browse to select files to share.' },
      { title: 'HTTP sharing', body: 'Enable Link Share mode to host files on a local HTTP server. Share the QR code or URL with recipients on the same network.' },
      { title: 'Receive', body: 'Accept or reject incoming file transfers.' },
    ],
    shortcuts: [],
  },
  dashboard: {
    appId: 'dashboard',
    displayName: 'Dashboard',
    guide: [
      { title: 'Overview', body: 'See running apps, system stats, and quick-launch tiles.' },
    ],
    shortcuts: [],
  },
  workflows: {
    appId: 'workflows',
    displayName: 'Workflows',
    guide: [
      { title: 'Create workflow', body: 'Click New Workflow and define trigger, steps, and actions.' },
      { title: 'Run', body: 'Select a workflow and click Run to execute it.' },
    ],
    shortcuts: [
      { key: 'Ctrl+N', action: 'New workflow' },
      { key: 'Ctrl+R', action: 'Run selected' },
    ],
  },
  calculator: {
    appId: 'calculator',
    displayName: 'Calculator',
    guide: [
      { title: 'Basic operations', body: 'Click number and operator buttons or type on your keyboard.' },
      { title: 'History', body: 'Previous calculations appear in the history panel.' },
    ],
    shortcuts: [
      { key: '0-9', action: 'Number input' },
      { key: '+ - * /', action: 'Operators' },
      { key: 'Enter', action: 'Equals' },
      { key: 'Escape', action: 'Clear' },
    ],
  },
  calendar: {
    appId: 'calendar',
    displayName: 'Calendar',
    guide: [
      { title: 'Navigate', body: 'Use arrow buttons to move between months. Click a date to select it.' },
      { title: 'Events', body: 'Click a date to create or view events for that day.' },
    ],
    shortcuts: [
      { key: 'Left / Right', action: 'Previous / Next month' },
      { key: 'T', action: 'Jump to today' },
    ],
  },
  passwordgenerator: {
    appId: 'passwordgenerator',
    displayName: 'Password Generator',
    guide: [
      { title: 'Generate', body: 'Set length and character options, then click Generate.' },
      { title: 'Copy', body: 'Click the Copy button to copy the password to clipboard.' },
    ],
    shortcuts: [
      { key: 'Enter', action: 'Generate new password' },
      { key: 'Ctrl+C', action: 'Copy to clipboard' },
    ],
  },
  settings: {
    appId: 'settings',
    displayName: 'Settings',
    guide: [
      { title: 'Theme', body: 'Switch between Dark and Light mode. Choose an accent colour.' },
      { title: 'General', body: 'Adjust language, startup behaviour, and notification preferences.' },
    ],
    shortcuts: [],
  },
  power: {
    appId: 'power',
    displayName: 'Power',
    guide: [
      { title: 'Controls', body: 'Shut down, restart, sleep, or lock DEX from this panel.' },
    ],
    shortcuts: [],
  },
  home: {
    appId: 'home',
    displayName: 'Home',
    guide: [
      { title: 'Launch apps', body: 'Click any app tile to open it. Recently-used apps appear first.' },
    ],
    shortcuts: [
      { key: 'Ctrl+K', action: 'Command palette' },
    ],
  },
};

export function getHelpContent(appId: string): AppHelpContent | null {
  return HELP[appId] || null;
}

export function getAllAppIds(): string[] {
  return Object.keys(HELP);
}

export default HELP;
