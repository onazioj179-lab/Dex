/**
 * DEX Achievement Catalog — 500 Achievements
 * Organized into 10 categories across the entire DEX ecosystem.
 * Achievements are earned through natural app usage.
 */

// ── Expanded Stats Interface ─────────────────────────────────────────────

export interface UserStats {
  // Core
  totalSessions: number;
  appsUsed: string[];
  currentStreak: number;
  longestStreak: number;
  totalMinutes: number;
  firstLaunch: string;
  lastActive: string;

  // Content Creation
  notesCreated: number;
  tasksCompleted: number;
  tasksCreated: number;
  filesOpened: number;
  filesUploaded: number;
  workflowsCreated: number;
  workflowsRun: number;
  calendarEventsCreated: number;
  kanbanCardsCreated: number;
  passwordsGenerated: number;

  // Media & Creative
  videosEdited: number;
  musicTracksCreated: number;
  imagesEdited: number;
  animationsCreated: number;
  filesConverted: number;
  galleryItemsViewed: number;
  audioTracksPlayed: number;
  videosWatched: number;
  screenRecordings: number;

  // Gaming
  gamesPlayed: number;
  typingTestsPlayed: number;
  memoryGamesPlayed: number;
  wordPuzzlesPlayed: number;
  reactionGamesPlayed: number;
  minesweeperGamesPlayed: number;
  bestTypingWPM: number;
  bestReactionMs: number;
  gamesWon: number;

  // Power User
  searchesPerformed: number;
  spotlightSearches: number;
  shortcutsUsed: number;
  settingsChanged: number;
  bookmarksCreated: number;
  browserTabsOpened: number;
  commandPaletteUses: number;
  clipboardUses: number;

  // Social
  transfersCompleted: number;
  dataExported: number;
  diagnosticsShared: number;
  favoritesPinned: number;

  // Discovery
  achievementsViewed: number;
  tipsRead: number;
  darkModeToggles: number;
  fullscreenToggles: number;
  rewindActivations: number;
  launchpadOpens: number;

  // Time-based
  nightSessions: number;
  morningSessions: number;
  weekendSessions: number;
  lunchSessions: number;

  // Per-app usage counts
  appUsageCounts: Record<string, number>;
}

export const DEFAULT_STATS: UserStats = {
  totalSessions: 0, appsUsed: [], currentStreak: 0, longestStreak: 0,
  totalMinutes: 0, firstLaunch: new Date().toISOString().split('T')[0],
  lastActive: new Date().toISOString().split('T')[0],
  notesCreated: 0, tasksCompleted: 0, tasksCreated: 0, filesOpened: 0,
  filesUploaded: 0, workflowsCreated: 0, workflowsRun: 0,
  calendarEventsCreated: 0, kanbanCardsCreated: 0, passwordsGenerated: 0,
  videosEdited: 0, musicTracksCreated: 0, imagesEdited: 0,
  animationsCreated: 0, filesConverted: 0, galleryItemsViewed: 0,
  audioTracksPlayed: 0, videosWatched: 0, screenRecordings: 0,
  gamesPlayed: 0, typingTestsPlayed: 0, memoryGamesPlayed: 0,
  wordPuzzlesPlayed: 0, reactionGamesPlayed: 0, minesweeperGamesPlayed: 0,
  bestTypingWPM: 0, bestReactionMs: 9999, gamesWon: 0,
  searchesPerformed: 0, spotlightSearches: 0, shortcutsUsed: 0,
  settingsChanged: 0, bookmarksCreated: 0, browserTabsOpened: 0,
  commandPaletteUses: 0, clipboardUses: 0,
  transfersCompleted: 0, dataExported: 0, diagnosticsShared: 0,
  favoritesPinned: 0,
  achievementsViewed: 0, tipsRead: 0, darkModeToggles: 0,
  fullscreenToggles: 0, rewindActivations: 0, launchpadOpens: 0,
  nightSessions: 0, morningSessions: 0, weekendSessions: 0, lunchSessions: 0,
  appUsageCounts: {},
};

// ── Achievement Definition ───────────────────────────────────────────────

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary';
export type AchievementCategory =
  | 'explorer' | 'creator' | 'power' | 'media'
  | 'gaming' | 'streak' | 'social' | 'mastery'
  | 'discovery' | 'speed';

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;       // DexIcon name (no emojis!)
  category: AchievementCategory;
  condition: (s: UserStats) => boolean;
  points: number;
  rarity: AchievementRarity;
  secret?: boolean;   // Hidden until unlocked
}

// ── Helper: generate tiered achievements ─────────────────────────────────

// Hard-mode scaling -- all count-based thresholds multiplied by 5x.
// Streak and capped categories keep natural thresholds.
const DIFFICULTY_SCALE = 5;
const NO_SCALE_BASES = new Set([
  'streak', 'best-streak', 'night', 'morning', 'weekend', 'lunch',
  'multi-app', 'switch', 'favorites', 'ach-count',
]);

function tiered(
  base: string, titleBase: string, descTemplate: string,
  icon: string, category: AchievementCategory,
  getValue: (s: UserStats) => number,
  tiers: [number, number, AchievementRarity][],
  suffixes?: string[],
): Achievement[] {
  const tierNames = suffixes || ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  const scale = NO_SCALE_BASES.has(base) ? 1 : DIFFICULTY_SCALE;
  return tiers.map(([raw, points, rarity], i) => {
    const threshold = raw * scale;
    return {
      id: `${base}-${i + 1}`,
      title: `${titleBase} ${tierNames[i] || (i + 1)}`,
      description: descTemplate.replace('{n}', threshold.toLocaleString()),
      icon,
      category,
      condition: (s: UserStats) => getValue(s) >= threshold,
      points: Math.round(points * (scale > 1 ? 1.5 : 1)),
      rarity,
    };
  });
}

function appFirstUse(appId: string, appName: string, icon: string): Achievement {
  return {
    id: `first-${appId}`,
    title: `${appName} Initiate`,
    description: `Open ${appName} for the first time`,
    icon,
    category: 'explorer',
    condition: s => s.appsUsed.includes(appId),
    points: 10,
    rarity: 'common',
  };
}

function appVeteran(appId: string, appName: string, icon: string, count: number, pts: number, rarity: AchievementRarity): Achievement {
  const scaled = count * DIFFICULTY_SCALE;
  return {
    id: `vet-${appId}-${count}`,
    title: `${appName} Veteran`,
    description: `Use ${appName} ${scaled.toLocaleString()} times`,
    icon,
    category: 'mastery',
    condition: s => (s.appUsageCounts[appId] || 0) >= scaled,
    points: Math.round(pts * 1.5),
    rarity,
  };
}

// ── All 25 App IDs & Names ───────────────────────────────────────────────

const APPS: [string, string, string][] = [
  ['home', 'Home', 'home'], ['dashboard', 'Dashboard', 'layout-dashboard'],
  ['files', 'Files', 'folder'], ['browser', 'Browser', 'globe'],
  ['transfers', 'Share', 'share'], ['settings', 'Settings', 'settings'],
  ['notes', 'Notes', 'file-text'], ['tasks', 'Tasks', 'check-square'],
  ['workflows', 'Workflows', 'shuffle'], ['calendar', 'Calendar', 'calendar'],
  ['gallery', 'Gallery', 'image'], ['audio', 'Music', 'music'],
  ['video', 'Video', 'video'], ['power', 'Power', 'power-off'],
  ['calculator', 'Calculator', 'calculator'], ['passwordgenerator', 'Passwords', 'lock'],
  ['videoeditor', 'VINX', 'film'], ['imosion', 'Imosion', 'mic'],
  ['prism', 'PRISM', 'image'], ['flux', 'FLUX', 'layers'],
  ['forge', 'FORGE', 'zap'], ['rewind', 'Rewind', 'rewind'],
  ['games', 'Games', 'gamepad'], ['kanban', 'Kanban', 'columns'],
  ['achievements', 'Trophies', 'trophy'],
];

// ══════════════════════════════════════════════════════════════════════════
//  ACHIEVEMENT CATALOG — 500 Achievements
// ══════════════════════════════════════════════════════════════════════════

export const ACHIEVEMENTS: Achievement[] = [

  // ═══ EXPLORER (100) — App discovery & exploration ═══════════════════════

  // First-use for each app (25)
  ...APPS.map(([id, name, icon]) => appFirstUse(id, name, icon)),

  // Use app 10 times (25)
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 10, 25, 'common')),

  // Use app 50 times (25)
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 50, 75, 'rare')),

  // Multi-app exploration milestones (10)
  ...tiered('multi-app', 'App Explorer', 'Use {n} different apps', 'compass', 'explorer',
    s => s.appsUsed.length,
    [[3, 15, 'common'], [5, 25, 'common'], [8, 40, 'common'], [10, 60, 'rare'],
     [12, 80, 'rare'], [15, 100, 'rare'], [18, 125, 'epic'], [20, 150, 'epic'],
     [22, 200, 'epic'], [25, 300, 'legendary']],
    ['Scout', 'Wanderer', 'Adventurer', 'Navigator', 'Pathfinder', 'Trailblazer', 'Pioneer', 'Voyager', 'Discoverer', 'Omni-User']
  ),

  // Creative suite combo (5)
  { id: 'suite-vinx', title: 'Video Apprentice', description: 'Open VINX Video Editor', icon: 'film', category: 'explorer', condition: s => s.appsUsed.includes('videoeditor'), points: 15, rarity: 'common' },
  { id: 'suite-imosion', title: 'Sound Explorer', description: 'Open Imosion DAW', icon: 'mic', category: 'explorer', condition: s => s.appsUsed.includes('imosion'), points: 15, rarity: 'common' },
  { id: 'suite-all', title: 'Creative Suite Master', description: 'Use all 5 creative apps', icon: 'sparkles', category: 'explorer',
    condition: s => ['videoeditor', 'imosion', 'prism', 'flux', 'forge'].every(a => s.appsUsed.includes(a)), points: 100, rarity: 'epic' },
  { id: 'prod-all', title: 'Productivity Suite', description: 'Use all productivity apps', icon: 'check-square', category: 'explorer',
    condition: s => ['notes', 'tasks', 'workflows', 'calendar', 'kanban'].every(a => s.appsUsed.includes(a)), points: 80, rarity: 'rare' },
  { id: 'media-all', title: 'Media Center', description: 'Use Gallery, Audio, and Video', icon: 'image', category: 'explorer',
    condition: s => ['gallery', 'audio', 'video'].every(a => s.appsUsed.includes(a)), points: 50, rarity: 'rare' },

  // App switching (5)
  ...tiered('switch', 'App Juggler', 'Switch between {n}+ apps in one session', 'shuffle', 'explorer',
    s => s.appsUsed.length,
    [[3, 15, 'common'], [5, 30, 'common'], [8, 50, 'rare'], [12, 80, 'epic'], [15, 120, 'legendary']],
    ['Starter', 'Multitasker', 'Juggler', 'Virtuoso', 'Maestro']
  ),

  // ═══ CREATOR (80) — Content creation ════════════════════════════════════

  // Notes (8)
  ...tiered('notes', 'Wordsmith', 'Create {n} notes', 'file-text', 'creator',
    s => s.notesCreated,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 75, 'rare'], [100, 100, 'epic'], [250, 150, 'epic'], [500, 250, 'legendary']],
    ['Scribbler', 'Writer', 'Author', 'Novelist', 'Chronicler', 'Sage', 'Archivist', 'Literary Legend']
  ),

  // Tasks completed (8)
  ...tiered('tasks-done', 'Achiever', 'Complete {n} tasks', 'check', 'creator',
    s => s.tasksCompleted,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 80, 'rare'], [100, 120, 'epic'], [250, 175, 'epic'], [500, 300, 'legendary']],
    ['Starter', 'Doer', 'Hustler', 'Machine', 'Powerhouse', 'Unstoppable', 'Relentless', 'Task God']
  ),

  // Tasks created (8)
  ...tiered('tasks-made', 'Planner', 'Create {n} tasks', 'list', 'creator',
    s => s.tasksCreated,
    [[1, 10, 'common'], [5, 15, 'common'], [10, 25, 'common'], [25, 40, 'rare'],
     [50, 60, 'rare'], [100, 90, 'epic'], [250, 140, 'epic'], [500, 220, 'legendary']],
    ['Beginner', 'Organizer', 'Strategist', 'Director', 'Architect', 'Mastermind', 'Visionary', 'Grand Planner']
  ),

  // Workflows (8)
  ...tiered('workflows', 'Automator', 'Create {n} workflows', 'shuffle', 'creator',
    s => s.workflowsCreated,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 75, 'rare'],
     [25, 100, 'epic'], [50, 150, 'epic'], [75, 200, 'legendary'], [100, 300, 'legendary']],
    ['Initiate', 'Tinkerer', 'Engineer', 'Architect', 'Virtuoso', 'Wizard', 'Sage', 'Automation God']
  ),

  // Calendar events (6)
  ...tiered('cal-events', 'Time Keeper', 'Create {n} calendar events', 'calendar', 'creator',
    s => s.calendarEventsCreated,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 40, 'rare'], [25, 60, 'rare'],
     [50, 90, 'epic'], [100, 150, 'legendary']],
    ['Scheduler', 'Organizer', 'Coordinator', 'Time Lord', 'Calendar King', 'Chrono Master']
  ),

  // Kanban cards (6)
  ...tiered('kanban-cards', 'Board Builder', 'Create {n} Kanban cards', 'columns', 'creator',
    s => s.kanbanCardsCreated,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 40, 'rare'], [25, 60, 'rare'],
     [50, 90, 'epic'], [100, 150, 'legendary']],
    ['Card Maker', 'Board User', 'Project Lead', 'Board Master', 'Kanban Pro', 'Agile Legend']
  ),

  // Passwords (6)
  ...tiered('passwords', 'Security Guard', 'Generate {n} passwords', 'lock', 'creator',
    s => s.passwordsGenerated,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 40, 'rare'], [25, 60, 'rare'],
     [50, 90, 'epic'], [100, 150, 'legendary']],
    ['Locksmith I', 'Locksmith II', 'Cipher', 'Cryptographer', 'Vault Keeper', 'Security Legend']
  ),

  // File uploads (6)
  ...tiered('uploads', 'Uploader', 'Upload {n} files', 'upload', 'creator',
    s => s.filesUploaded,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'rare'], [25, 55, 'rare'],
     [50, 85, 'epic'], [100, 130, 'legendary']],
    ['First Upload', 'Contributor', 'Curator', 'Librarian', 'Archivist', 'Data Titan']
  ),

  // Workflow runs (4)
  ...tiered('wf-runs', 'Operator', 'Run {n} workflows', 'zap', 'creator',
    s => s.workflowsRun,
    [[1, 10, 'common'], [10, 30, 'common'], [50, 70, 'rare'], [100, 120, 'epic']],
    ['Trigger', 'Runner', 'Executor', 'Pipeline King']
  ),

  // ═══ POWER (70) — Power user features ══════════════════════════════════

  // Searches (8)
  ...tiered('search', 'Seeker', 'Perform {n} searches', 'search', 'power',
    s => s.searchesPerformed,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'common'], [100, 50, 'rare'],
     [250, 80, 'rare'], [500, 120, 'epic'], [1000, 175, 'epic'], [5000, 300, 'legendary']],
    ['Curious', 'Inquisitive', 'Researcher', 'Investigator', 'Detective', 'Scholar', 'Oracle', 'Omniscient']
  ),

  // Spotlight (6)
  ...tiered('spotlight', 'Spotlight', 'Use Spotlight {n} times', 'search', 'power',
    s => s.spotlightSearches,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'rare'],
     [250, 120, 'epic'], [500, 200, 'legendary']],
    ['Flash', 'Beam', 'Ray', 'Laser', 'Supernova', 'Singularity']
  ),

  // Files opened (8)
  ...tiered('files-open', 'File Master', 'Open {n} files', 'folder', 'power',
    s => s.filesOpened,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'common'], [100, 50, 'rare'],
     [250, 80, 'rare'], [500, 120, 'epic'], [1000, 175, 'epic'], [2500, 300, 'legendary']],
    ['Browser', 'Reader', 'Collector', 'Organizer', 'Librarian', 'Curator', 'Archivist', 'Data Sage']
  ),

  // Keyboard shortcuts (6)
  ...tiered('shortcuts', 'Shortcut Ninja', 'Use {n} keyboard shortcuts', 'terminal', 'power',
    s => s.shortcutsUsed,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'rare'],
     [250, 130, 'epic'], [500, 200, 'legendary']],
    ['Rookie', 'Apprentice', 'Adept', 'Expert', 'Master', 'Keyboard Wizard']
  ),

  // Command palette (5)
  ...tiered('cmd-palette', 'Commander', 'Use Command Palette {n} times', 'terminal', 'power',
    s => s.commandPaletteUses,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 90, 'epic'], [250, 150, 'legendary']],
    ['Initiate', 'Operator', 'Controller', 'Commander', 'Admiral']
  ),

  // Clipboard (4)
  ...tiered('clipboard', 'Clipboard Pro', 'Use clipboard {n} times', 'clipboard', 'power',
    s => s.clipboardUses,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 90, 'epic']],
    ['Copy Cat', 'Paster', 'Clipper', 'Clipboard King']
  ),

  // Browser tabs (6)
  ...tiered('tabs', 'Tab Collector', 'Open {n} browser tabs', 'globe', 'power',
    s => s.browserTabsOpened,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 80, 'epic'], [100, 130, 'legendary']],
    ['Single Tab', 'Few Tabs', 'Tab User', 'Tab Hoarder', 'Tab Maniac', 'Tab Singularity']
  ),

  // Bookmarks (6)
  ...tiered('bookmarks', 'Bookmarker', 'Create {n} bookmarks', 'bookmark', 'power',
    s => s.bookmarksCreated,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'rare'], [25, 55, 'rare'],
     [50, 85, 'epic'], [100, 140, 'legendary']],
    ['Marker', 'Saver', 'Collector', 'Curator', 'Librarian', 'Bookmark Oracle']
  ),

  // Settings (4)
  ...tiered('settings-ch', 'Customizer', 'Change {n} settings', 'settings', 'power',
    s => s.settingsChanged,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic']],
    ['Tweaker', 'Tuner', 'Configurator', 'Settings Sage']
  ),

  // Fullscreen (3)
  ...tiered('fullscreen', 'Immersive', 'Toggle fullscreen {n} times', 'maximize', 'power',
    s => s.fullscreenToggles,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare']],
    ['Windowed', 'Full View', 'Maximizer']
  ),

  // Dark mode (3)
  ...tiered('darkmode', 'Theme Master', 'Toggle dark mode {n} times', 'moon', 'power',
    s => s.darkModeToggles,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare']],
    ['Light Seeker', 'Mode Switcher', 'Theme Wizard']
  ),

  // Dock usage (3)
  ...tiered('dock-use', 'Dock Commander', 'Switch apps {n} times via the dock', 'grid', 'power',
    s => Object.values(s.appUsageCounts).reduce((sum, n) => sum + n, 0),
    [[10, 10, 'common'], [50, 25, 'common'], [250, 60, 'rare']],
    ['Dock User', 'Dock Pro', 'Dock Master']
  ),

  // Favorites pinned (4)
  ...tiered('favorites', 'Curator', 'Pin {n} favorite apps', 'pin', 'power',
    s => s.favoritesPinned,
    [[1, 10, 'common'], [3, 20, 'common'], [5, 35, 'rare'], [10, 60, 'epic']],
    ['First Pin', 'Pinner', 'Collector', 'Pinboard Pro']
  ),

  // ═══ MEDIA (60) — Media creation & consumption ═════════════════════════

  // Gallery (6)
  ...tiered('gallery', 'Gallery Goer', 'View {n} gallery items', 'image', 'media',
    s => s.galleryItemsViewed,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 65, 'rare'],
     [250, 100, 'epic'], [500, 160, 'legendary']],
    ['Glancer', 'Viewer', 'Browser', 'Curator', 'Connoisseur', 'Art Critic']
  ),

  // Audio played (6)
  ...tiered('audio-play', 'Music Lover', 'Play {n} audio tracks', 'music', 'media',
    s => s.audioTracksPlayed,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 85, 'epic'], [100, 140, 'legendary']],
    ['Listener', 'Fan', 'Audiophile', 'Melomaniac', 'Sound Sage', 'Music God']
  ),

  // Video watched (6)
  ...tiered('video-watch', 'Cinephile', 'Watch {n} videos', 'video', 'media',
    s => s.videosWatched,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 85, 'epic'], [100, 140, 'legendary']],
    ['Viewer', 'Watcher', 'Binge Watcher', 'Cinephile', 'Film Critic', 'Movie Legend']
  ),

  // VINX edits (6)
  ...tiered('vinx-edit', 'Film Editor', 'Edit {n} videos in VINX', 'film', 'media',
    s => s.videosEdited,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 80, 'rare'],
     [25, 130, 'epic'], [50, 200, 'legendary']],
    ['First Cut', 'Editor', 'Director', 'Producer', 'Auteur', 'Cinema Legend']
  ),

  // Imosion tracks (6)
  ...tiered('imosion-trk', 'Beat Maker', 'Create {n} tracks in Imosion', 'mic', 'media',
    s => s.musicTracksCreated,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 80, 'rare'],
     [25, 130, 'epic'], [50, 200, 'legendary']],
    ['First Beat', 'Composer', 'Producer', 'Maestro', 'Virtuoso', 'Sound Legend']
  ),

  // PRISM edits (6)
  ...tiered('prism-edit', 'Pixel Artist', 'Edit {n} images in PRISM', 'image', 'media',
    s => s.imagesEdited,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 80, 'rare'],
     [25, 130, 'epic'], [50, 200, 'legendary']],
    ['First Filter', 'Retoucher', 'Designer', 'Artist', 'Visionary', 'Pixel God']
  ),

  // FLUX animations (6)
  ...tiered('flux-anim', 'Motion Designer', 'Create {n} animations in FLUX', 'layers', 'media',
    s => s.animationsCreated,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 80, 'rare'],
     [25, 130, 'epic'], [50, 200, 'legendary']],
    ['First Frame', 'Animator', 'Motion Pro', 'VFX Artist', 'Motion Master', 'Animation God']
  ),

  // FORGE conversions (6)
  ...tiered('forge-conv', 'Converter', 'Convert {n} files in FORGE', 'zap', 'media',
    s => s.filesConverted,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 70, 'rare'],
     [50, 110, 'epic'], [100, 175, 'legendary']],
    ['First Convert', 'Transcoder', 'Encoder', 'Format Pro', 'Codec Master', 'Forge Legend']
  ),

  // Screen recordings (3)
  ...tiered('screen-rec', 'Screen Recorder', 'Make {n} screen recordings', 'monitor', 'media',
    s => s.screenRecordings,
    [[1, 15, 'common'], [5, 40, 'rare'], [10, 75, 'epic']],
    ['First Recording', 'Recorder', 'Broadcast Pro']
  ),

  // Media variety (5)
  { id: 'media-type-2', title: 'Multimedia Dabbler', description: 'Create 50+ items in 2 different media types', icon: 'layers', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 50).length >= 2,
    points: 40, rarity: 'rare' },
  { id: 'media-type-3', title: 'Multimedia Creator', description: 'Create 50+ items in 3 different media types', icon: 'layers', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 50).length >= 3,
    points: 80, rarity: 'epic' },
  { id: 'media-type-4', title: 'Multimedia Expert', description: 'Create 100+ items in 4 different media types', icon: 'layers', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 100).length >= 4,
    points: 150, rarity: 'epic' },
  { id: 'media-type-5', title: 'Multimedia Master', description: 'Create 100+ items in 5 different media types', icon: 'sparkles', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 100).length >= 5,
    points: 250, rarity: 'legendary' },
  { id: 'media-renaissance', title: 'Renaissance Creator', description: 'Create 50+ works in every creative app', icon: 'crown', category: 'media',
    condition: s => s.videosEdited >= 50 && s.musicTracksCreated >= 50 && s.imagesEdited >= 50 && s.animationsCreated >= 50 && s.filesConverted >= 50,
    points: 500, rarity: 'legendary' },

  // ═══ GAMING (50) — Games hub achievements ══════════════════════════════

  // Total games (8)
  ...tiered('games-total', 'Gamer', 'Play {n} total games', 'gamepad', 'gaming',
    s => s.gamesPlayed,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 30, 'common'], [25, 50, 'rare'],
     [50, 80, 'rare'], [100, 120, 'epic'], [250, 200, 'epic'], [500, 350, 'legendary']],
    ['Noob', 'Casual', 'Regular', 'Enthusiast', 'Dedicated', 'Hardcore', 'Pro', 'Gaming Legend']
  ),

  // Typing tests (5)
  ...tiered('typing', 'Speed Typist', 'Play {n} typing tests', 'type', 'gaming',
    s => s.typingTestsPlayed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic'], [50, 120, 'legendary']],
    ['Hunt & Peck', 'Touch Typist', 'Fast Fingers', 'Speed Demon', 'Typing Legend']
  ),

  // Memory games (5)
  ...tiered('memory', 'Memory Master', 'Play {n} memory games', 'brain', 'gaming',
    s => s.memoryGamesPlayed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic'], [50, 120, 'legendary']],
    ['Forgetful', 'Mnemonist', 'Recall Pro', 'Elephant', 'Total Recall']
  ),

  // Word puzzles (5)
  ...tiered('wordpuzz', 'Wordsmith', 'Play {n} word puzzles', 'book-open', 'gaming',
    s => s.wordPuzzlesPlayed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic'], [50, 120, 'legendary']],
    ['Speller', 'Linguist', 'Etymologist', 'Lexicographer', 'Word God']
  ),

  // Reaction time (5)
  ...tiered('reaction', 'Quick Reflex', 'Play {n} reaction games', 'zap', 'gaming',
    s => s.reactionGamesPlayed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic'], [50, 120, 'legendary']],
    ['Slowpoke', 'Average', 'Quick Draw', 'Lightning', 'The Flash']
  ),

  // Minesweeper (5)
  ...tiered('minesweep', 'Mine Sweeper', 'Play {n} minesweeper games', 'bomb', 'gaming',
    s => s.minesweeperGamesPlayed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic'], [50, 120, 'legendary']],
    ['Recruit', 'Sapper', 'Demolitionist', 'Bomb Expert', 'Mine Legend']
  ),

  // Typing speed tiers (5)
  { id: 'wpm-40', title: 'Functional Typist', description: 'Reach 40 WPM in typing test', icon: 'type', category: 'gaming', condition: s => s.bestTypingWPM >= 40, points: 20, rarity: 'common' },
  { id: 'wpm-60', title: 'Solid Typist', description: 'Reach 60 WPM in typing test', icon: 'type', category: 'gaming', condition: s => s.bestTypingWPM >= 60, points: 40, rarity: 'rare' },
  { id: 'wpm-80', title: 'Speed Typist', description: 'Reach 80 WPM in typing test', icon: 'type', category: 'gaming', condition: s => s.bestTypingWPM >= 80, points: 70, rarity: 'rare' },
  { id: 'wpm-100', title: 'Lightning Fingers', description: 'Reach 100 WPM in typing test', icon: 'type', category: 'gaming', condition: s => s.bestTypingWPM >= 100, points: 120, rarity: 'epic' },
  { id: 'wpm-120', title: 'Keyboard Demon', description: 'Reach 120 WPM in typing test', icon: 'type', category: 'gaming', condition: s => s.bestTypingWPM >= 120, points: 200, rarity: 'legendary' },

  // Reaction speed (3)
  { id: 'react-250', title: 'Sharp Reflexes', description: 'Achieve sub-250ms reaction time', icon: 'zap', category: 'gaming', condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 250, points: 30, rarity: 'common' },
  { id: 'react-200', title: 'Lightning Reflexes', description: 'Achieve sub-200ms reaction time', icon: 'zap', category: 'gaming', condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 200, points: 60, rarity: 'rare' },
  { id: 'react-150', title: 'Inhuman Reflexes', description: 'Achieve sub-150ms reaction time', icon: 'zap', category: 'gaming', condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 150, points: 120, rarity: 'epic' },

  // Games won (5)
  ...tiered('wins', 'Winner', 'Win {n} games', 'trophy', 'gaming',
    s => s.gamesWon,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'], [50, 150, 'legendary']],
    ['First Win', 'Competitor', 'Champion', 'Dominator', 'Undefeatable']
  ),

  // All game types (1)
  { id: 'all-games', title: 'Game Master', description: 'Play 50+ of every game type', icon: 'gamepad', category: 'gaming',
    condition: s => s.typingTestsPlayed >= 50 && s.memoryGamesPlayed >= 50 && s.wordPuzzlesPlayed >= 50 && s.reactionGamesPlayed >= 50 && s.minesweeperGamesPlayed >= 50,
    points: 150, rarity: 'epic' },

  // Gaming marathon (3)
  { id: 'game-15m', title: 'Quick Session', description: 'Play 50+ total games', icon: 'clock', category: 'gaming', condition: s => s.gamesPlayed >= 50, points: 25, rarity: 'common' },
  { id: 'game-30m', title: 'Gaming Session', description: 'Play 100+ total games', icon: 'clock', category: 'gaming', condition: s => s.gamesPlayed >= 100, points: 50, rarity: 'rare' },
  { id: 'game-marathon', title: 'Gaming Marathon', description: 'Play 500+ total games', icon: 'clock', category: 'gaming', condition: s => s.gamesPlayed >= 500, points: 100, rarity: 'epic' },

  // ═══ STREAK (50) — Consistency & daily use ═════════════════════════════

  // Day streaks (21)
  ...tiered('streak', 'Streak Builder', 'Use DEX {n} days in a row', 'flame', 'streak',
    s => s.currentStreak,
    [[1, 5, 'common'], [2, 10, 'common'], [3, 15, 'common'], [5, 25, 'common'],
     [7, 40, 'rare'], [10, 55, 'rare'], [14, 75, 'rare'], [21, 100, 'epic'],
     [30, 130, 'epic'], [45, 160, 'epic'], [60, 200, 'legendary'], [75, 225, 'legendary'],
     [90, 260, 'legendary'], [100, 300, 'legendary'], [120, 350, 'legendary'],
     [150, 400, 'legendary'], [180, 450, 'legendary'], [200, 500, 'legendary'],
     [250, 600, 'legendary'], [300, 750, 'legendary'], [365, 1000, 'legendary']],
    ['Day 1', 'Two-fer', 'Hat Trick', 'Work Week', 'Full Week', 'Ten Streak', 'Fortnight',
     'Three Weeks', 'Monthly', '45 Days', 'Two Months', '75 Days', 'Quarter',
     'Centurion', 'Four Months', 'Five Months', 'Half Year', '200 Days',
     '250 Days', '300 Days', 'Full Year']
  ),

  // Longest streak milestones (7)
  ...tiered('best-streak', 'Record Streak', 'Achieve longest streak of {n} days', 'star', 'streak',
    s => s.longestStreak,
    [[7, 30, 'common'], [14, 50, 'rare'], [30, 80, 'rare'], [60, 120, 'epic'],
     [90, 175, 'epic'], [180, 250, 'legendary'], [365, 500, 'legendary']],
    ['Week Record', 'Fortnight Record', 'Month Record', '2-Month Record', 'Quarter Record', 'Half-Year Record', 'Year Record']
  ),

  // Time-of-day based (8)
  ...tiered('night', 'Night Owl', 'Use DEX after midnight {n} times', 'moon', 'streak',
    s => s.nightSessions,
    [[1, 10, 'common'], [10, 30, 'rare'], [50, 70, 'epic']],
    ['Late Night', 'Night Owl', 'Nocturnal']
  ),
  ...tiered('morning', 'Early Bird', 'Use DEX before 8 AM {n} times', 'sun', 'streak',
    s => s.morningSessions,
    [[1, 10, 'common'], [10, 30, 'rare'], [50, 70, 'epic']],
    ['Dawn User', 'Early Bird', 'Sunrise Sage']
  ),

  // Weekend (3)
  ...tiered('weekend', 'Weekend Warrior', 'Use DEX on {n} weekends', 'calendar', 'streak',
    s => s.weekendSessions,
    [[1, 10, 'common'], [10, 30, 'rare'], [25, 70, 'epic']],
    ['Weekend Dabbler', 'Weekend Regular', 'Weekend Warrior']
  ),

  // Lunch sessions (3)
  ...tiered('lunch', 'Lunch Break', 'Use DEX during lunch {n} times', 'clock', 'streak',
    s => s.lunchSessions,
    [[1, 10, 'common'], [10, 30, 'rare'], [50, 70, 'epic']],
    ['Quick Break', 'Regular Break', 'Lunch Legend']
  ),

  // Return after absence (5)
  { id: 'comeback-1', title: 'Welcome Back', description: 'Complete 25 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 25, points: 15, rarity: 'common' },
  { id: 'comeback-10', title: 'Loyal User', description: 'Complete 100 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 100, points: 40, rarity: 'common' },
  { id: 'comeback-25', title: 'Regular', description: 'Complete 250 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 250, points: 75, rarity: 'rare' },
  { id: 'comeback-50', title: 'Dedicated', description: 'Complete 500 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 500, points: 120, rarity: 'rare' },
  { id: 'comeback-100', title: 'Centurion', description: 'Complete 1,000 sessions', icon: 'award', category: 'streak', condition: s => s.totalSessions >= 1000, points: 200, rarity: 'epic' },

  // ═══ SOCIAL (30) — Sharing & collaboration ═════════════════════════════

  // Transfers (6)
  ...tiered('transfers', 'Sharer', 'Complete {n} transfers', 'share', 'social',
    s => s.transfersCompleted,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 70, 'rare'],
     [50, 110, 'epic'], [100, 175, 'legendary']],
    ['First Share', 'Sharer', 'Networker', 'Connector', 'Hub', 'Sharing Legend']
  ),

  // Data exports (6)
  ...tiered('exports', 'Exporter', 'Export data {n} times', 'download', 'social',
    s => s.dataExported,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 70, 'rare'],
     [50, 110, 'epic'], [100, 175, 'legendary']],
    ['First Export', 'Backup Maker', 'Data Saver', 'Archivist', 'Data Pro', 'Export Legend']
  ),

  // Diagnostics shared (4)
  ...tiered('diag', 'Bug Hunter', 'Share diagnostics {n} times', 'activity', 'social',
    s => s.diagnosticsShared,
    [[1, 15, 'common'], [3, 35, 'rare'], [5, 60, 'epic'], [10, 100, 'legendary']],
    ['First Report', 'Reporter', 'Debugger', 'Quality Hero']
  ),

  // Tips read (6)
  ...tiered('tips', 'Learner', 'Read {n} tips', 'lightbulb', 'social',
    s => s.tipsRead,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [15, 50, 'rare'],
     [20, 75, 'epic'], [25, 100, 'legendary']],
    ['Curious', 'Student', 'Learner', 'Scholar', 'Sage', 'Enlightened']
  ),

  // Rewind usage (4)
  ...tiered('rewind-use', 'Time Traveler', 'Use Rewind {n} times', 'rewind', 'social',
    s => s.rewindActivations,
    [[1, 15, 'common'], [5, 35, 'rare'], [10, 65, 'epic'], [25, 110, 'legendary']],
    ['First Rewind', 'Reviewer', 'Historian', 'Time Lord']
  ),

  // Achievement viewing (4)
  ...tiered('ach-view', 'Trophy Hunter', 'View trophy case {n} times', 'trophy', 'social',
    s => s.achievementsViewed,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic']],
    ['First Peek', 'Checker', 'Enthusiast', 'Trophy Addict']
  ),

  // ═══ MASTERY (40) — Deep expertise & long-term ═════════════════════════

  // Session milestones (8)
  ...tiered('sessions', 'DEX Veteran', 'Complete {n} sessions', 'shield', 'mastery',
    s => s.totalSessions,
    [[5, 10, 'common'], [10, 20, 'common'], [25, 35, 'common'], [50, 55, 'rare'],
     [100, 90, 'rare'], [250, 140, 'epic'], [500, 225, 'epic'], [1000, 400, 'legendary']],
    ['Newcomer', 'Regular', 'Familiar', 'Committed', 'Veteran', 'Expert', 'Master', 'Legend']
  ),

  // Time invested (8)
  ...tiered('time', 'Time Invested', 'Use DEX for {n} total hours', 'clock', 'mastery',
    s => Math.floor(s.totalMinutes / 60),
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [24, 75, 'rare'],
     [50, 120, 'epic'], [100, 200, 'epic'], [250, 350, 'legendary'], [500, 600, 'legendary']],
    ['First Hour', '5 Hours', '10 Hours', 'Full Day', '50 Hours', 'Centurion', 'Quarter K', 'Half Millennium']
  ),

  // Points milestones (8)
  ...tiered('points', 'Point Collector', 'Earn {n} achievement points', 'star', 'mastery',
    s => {
      // Calculate points dynamically — use a proxy since we don't store points in stats
      // This is a rough estimate based on unlocked count
      return 0; // Will be overridden by the engine
    },
    [[100, 20, 'common'], [250, 40, 'common'], [500, 70, 'rare'], [1000, 110, 'rare'],
     [2500, 175, 'epic'], [5000, 275, 'epic'], [10000, 450, 'legendary'], [25000, 750, 'legendary']],
    ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Emerald', 'Ruby', 'Obsidian']
  ),

  // Achievement hunter (meta) (8)
  ...tiered('ach-count', 'Achievement Hunter', 'Unlock {n} achievements', 'trophy', 'mastery',
    s => 0, // Will be overridden by custom logic in engine
    [[10, 25, 'common'], [25, 50, 'common'], [50, 80, 'rare'], [100, 130, 'rare'],
     [200, 200, 'epic'], [300, 300, 'epic'], [400, 450, 'legendary'], [500, 1000, 'legendary']],
    ['Collector', 'Hunter', 'Seeker', 'Conqueror', 'Dominator', 'Champion', 'Ascendant', 'Completionist']
  ),

  // Rank progression (6)
  { id: 'rank-beginner', title: 'Getting Started', description: 'Reach Beginner rank', icon: 'arrow-right', category: 'mastery', condition: () => false, points: 15, rarity: 'common' },
  { id: 'rank-regular', title: 'Going Steady', description: 'Reach Regular rank', icon: 'trending-up', category: 'mastery', condition: () => false, points: 30, rarity: 'common' },
  { id: 'rank-pro', title: 'Professional', description: 'Reach Pro rank', icon: 'trending-up', category: 'mastery', condition: () => false, points: 60, rarity: 'rare' },
  { id: 'rank-expert', title: 'Expert Status', description: 'Reach Expert rank', icon: 'award', category: 'mastery', condition: () => false, points: 100, rarity: 'epic' },
  { id: 'rank-legend', title: 'Legendary Status', description: 'Reach Legend rank', icon: 'crown', category: 'mastery', condition: () => false, points: 200, rarity: 'legendary' },
  { id: 'mastery-year', title: 'Year One', description: 'Use DEX for 365 days since first launch', icon: 'crown', category: 'mastery',
    condition: s => { const d = new Date(s.firstLaunch); const n = new Date(); return (n.getTime() - d.getTime()) / 86400000 >= 365; },
    points: 500, rarity: 'legendary' },

  // ═══ DISCOVERY (20) — Hidden features & easter eggs ════════════════════

  { id: 'disc-settings', title: 'Tweaker', description: 'Change 10 settings', icon: 'settings', category: 'discovery', condition: s => s.settingsChanged >= 10, points: 10, rarity: 'common' },
  { id: 'disc-search', title: 'Seeker', description: 'Perform 50 searches', icon: 'search', category: 'discovery', condition: s => s.searchesPerformed >= 50, points: 10, rarity: 'common' },
  { id: 'disc-game', title: 'Player', description: 'Play 25 games', icon: 'gamepad', category: 'discovery', condition: s => s.gamesPlayed >= 25, points: 10, rarity: 'common' },
  { id: 'disc-note', title: 'Scribe', description: 'Create 25 notes', icon: 'file-text', category: 'discovery', condition: s => s.notesCreated >= 25, points: 10, rarity: 'common' },
  { id: 'disc-task', title: 'Tasker', description: 'Create 25 tasks', icon: 'check-square', category: 'discovery', condition: s => s.tasksCreated >= 25, points: 10, rarity: 'common' },
  { id: 'disc-file', title: 'File Opener', description: 'Open 25 files', icon: 'folder', category: 'discovery', condition: s => s.filesOpened >= 25, points: 10, rarity: 'common' },
  { id: 'disc-workflow', title: 'Automation Curious', description: 'Create 10 workflows', icon: 'shuffle', category: 'discovery', condition: s => s.workflowsCreated >= 10, points: 15, rarity: 'common' },
  { id: 'disc-transfer', title: 'Connector', description: 'Complete 10 transfers', icon: 'share', category: 'discovery', condition: s => s.transfersCompleted >= 10, points: 15, rarity: 'common' },
  { id: 'disc-creative', title: 'Creative Spark', description: 'Use all 5 creative apps', icon: 'sparkles', category: 'discovery',
    condition: s => ['videoeditor', 'imosion', 'prism', 'flux', 'forge'].every(a => s.appsUsed.includes(a)), points: 25, rarity: 'rare' },
  { id: 'disc-dock', title: 'Dock Pilot', description: 'Use 10 different apps from the dock', icon: 'grid', category: 'discovery', condition: s => s.appsUsed.length >= 10, points: 15, rarity: 'common' },

  // Secret / Hidden achievements (10)
  { id: 'secret-100sess', title: 'Silent Grinder', description: 'Complete 1,000 sessions without checking achievements', icon: 'shield', category: 'discovery', condition: s => s.totalSessions >= 1000 && s.achievementsViewed === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-allcreative', title: 'Renaissance Person', description: 'Create 100+ works in every creative app', icon: 'sparkles', category: 'discovery',
    condition: s => s.videosEdited >= 100 && s.musicTracksCreated >= 100 && s.imagesEdited >= 100 && s.animationsCreated >= 100 && s.filesConverted >= 100,
    points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-nightowl-streak', title: 'Vampire', description: 'Use DEX after midnight for 30 straight days', icon: 'moon', category: 'discovery', condition: s => s.nightSessions >= 30 && s.currentStreak >= 30, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-speed-demon', title: 'Speed Demon', description: 'Achieve sub-150ms reaction AND 120+ WPM typing', icon: 'zap', category: 'discovery', condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 150 && s.bestTypingWPM >= 120, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-no-games', title: 'All Work No Play', description: 'Complete 500 tasks without playing any games', icon: 'check', category: 'discovery', condition: s => s.tasksCompleted >= 500 && s.gamesPlayed === 0, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-gamer-only', title: 'All Play No Work', description: 'Play 500 games without creating any notes or tasks', icon: 'gamepad', category: 'discovery', condition: s => s.gamesPlayed >= 500 && s.notesCreated === 0 && s.tasksCreated === 0, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-explorer-max', title: 'The Explorer', description: 'Use every app 100+ times each', icon: 'compass', category: 'discovery', condition: s => s.appsUsed.length >= 25 && Object.values(s.appUsageCounts).every(c => c >= 100), points: 500, rarity: 'legendary', secret: true },
  { id: 'secret-perfectionist', title: 'Perfectionist', description: 'Change 250+ settings and generate 250+ passwords', icon: 'settings', category: 'discovery', condition: s => s.settingsChanged >= 250 && s.passwordsGenerated >= 250, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-loyal', title: 'Undying Loyalty', description: 'Use DEX for 365 consecutive days', icon: 'heart', category: 'discovery', condition: s => s.currentStreak >= 365, points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-power-weekend', title: 'Power Weekend', description: 'Use 20+ apps on a weekend session', icon: 'sun', category: 'discovery', condition: s => s.weekendSessions > 0 && s.appsUsed.length >= 20, points: 150, rarity: 'legendary', secret: true },

  // ═══ SPEED (20 remaining to reach 500) ═════════════════════════════════

  // Quick session achievements - reward efficiency
  { id: 'speed-3apps', title: 'Quick Switcher', description: 'Use 8 apps in a session', icon: 'zap', category: 'speed', condition: s => s.appsUsed.length >= 8, points: 25, rarity: 'common' },
  { id: 'speed-5apps', title: 'Rapid Explorer', description: 'Use 12 apps in a single session', icon: 'zap', category: 'speed', condition: s => s.appsUsed.length >= 12, points: 50, rarity: 'rare' },
  { id: 'speed-10apps', title: 'App Blitz', description: 'Use 20 apps in a single session', icon: 'zap', category: 'speed', condition: s => s.appsUsed.length >= 20, points: 100, rarity: 'epic' },

  // Multi-action achievements
  { id: 'speed-note-task', title: 'Productive Burst', description: 'Create 25+ notes and 25+ tasks', icon: 'file-text', category: 'speed', condition: s => s.notesCreated >= 25 && s.tasksCreated >= 25, points: 40, rarity: 'rare' },
  { id: 'speed-triple', title: 'Triple Threat', description: 'Create 50+ notes, 50+ tasks, and 50+ events', icon: 'check-square', category: 'speed', condition: s => s.notesCreated >= 50 && s.tasksCreated >= 50 && s.calendarEventsCreated >= 50, points: 80, rarity: 'epic' },
  { id: 'speed-search-find', title: 'Instant Finder', description: 'Perform 100 searches', icon: 'search', category: 'speed', condition: s => s.searchesPerformed >= 100, points: 40, rarity: 'rare' },
  { id: 'speed-poweruser', title: 'Power Session', description: 'Use 50 keyboard shortcuts', icon: 'terminal', category: 'speed', condition: s => s.shortcutsUsed >= 50, points: 50, rarity: 'rare' },
  { id: 'speed-megapower', title: 'Keyboard Warrior', description: 'Use 250 keyboard shortcuts', icon: 'terminal', category: 'speed', condition: s => s.shortcutsUsed >= 250, points: 120, rarity: 'epic' },
  { id: 'speed-ultrapower', title: 'Shortcut Grandmaster', description: 'Use 1,000 keyboard shortcuts', icon: 'terminal', category: 'speed', condition: s => s.shortcutsUsed >= 1000, points: 200, rarity: 'legendary' },

  // Rapid content creation
  { id: 'speed-5notes', title: 'Note Storm', description: 'Create 50 notes', icon: 'file-text', category: 'speed', condition: s => s.notesCreated >= 50, points: 40, rarity: 'rare' },
  { id: 'speed-10tasks', title: 'Task Blitz', description: 'Create 100 tasks', icon: 'check-square', category: 'speed', condition: s => s.tasksCreated >= 100, points: 50, rarity: 'rare' },
  { id: 'speed-search-master', title: 'Search Master', description: 'Perform 1,000 searches', icon: 'search', category: 'speed', condition: s => s.searchesPerformed >= 1000, points: 100, rarity: 'epic' },

  // First-time speed
  { id: 'speed-first-5min', title: 'Quick Start', description: 'Open 5 apps in your first few sessions', icon: 'rocket', category: 'speed', condition: s => s.totalSessions <= 5 && s.appsUsed.length >= 5, points: 15, rarity: 'common' },
  { id: 'speed-first-explore', title: 'Curious Mind', description: 'Open 12 different apps in first 5 sessions', icon: 'compass', category: 'speed', condition: s => s.totalSessions <= 5 && s.appsUsed.length >= 12, points: 50, rarity: 'rare' },

  // Long-term efficiency
  { id: 'speed-efficient', title: 'Efficiency Expert', description: 'Average 5+ app switches per session over 100 sessions', icon: 'trending-up', category: 'speed', condition: s => s.totalSessions >= 100 && Object.values(s.appUsageCounts).reduce((a, b) => a + b, 0) / s.totalSessions >= 5, points: 100, rarity: 'epic' },
  { id: 'speed-wf-run-10', title: 'Automation Pro', description: 'Run 100 automated workflows', icon: 'shuffle', category: 'speed', condition: s => s.workflowsRun >= 100, points: 75, rarity: 'epic' },
  { id: 'speed-wf-run-50', title: 'Automation Master', description: 'Run 500 automated workflows', icon: 'shuffle', category: 'speed', condition: s => s.workflowsRun >= 500, points: 150, rarity: 'legendary' },
  { id: 'speed-file-50', title: 'File Processor', description: 'Open 500 files total', icon: 'folder', category: 'speed', condition: s => s.filesOpened >= 500, points: 75, rarity: 'rare' },
  { id: 'speed-daily-prod', title: 'Daily Producer', description: 'Maintain a 30-day streak with 30+ notes', icon: 'flame', category: 'speed', condition: s => s.currentStreak >= 30 && s.notesCreated >= 30, points: 100, rarity: 'epic' },
  { id: 'speed-master-of-all', title: 'Master of All', description: 'Use every category of apps 50+ times each', icon: 'crown', category: 'speed',
    condition: s =>
      (s.appUsageCounts['home'] || 0) >= 50 && (s.appUsageCounts['notes'] || 0) >= 50 &&
      (s.appUsageCounts['videoeditor'] || 0) >= 50 && (s.appUsageCounts['gallery'] || 0) >= 50 &&
      (s.appUsageCounts['calculator'] || 0) >= 50 && (s.appUsageCounts['games'] || 0) >= 50,
    points: 200, rarity: 'legendary' },

  // ═══ BONUS — Additional achievements to reach 500 ═════════════════════

  // App veteran 100x for top apps (5)
  ...['home', 'notes', 'files', 'browser', 'tasks'].map((id, i) =>
    appVeteran(id, APPS.find(a => a[0] === id)?.[1] || id, APPS.find(a => a[0] === id)?.[2] || 'star', 100, 150, 'epic' as AchievementRarity)
  ),

  // Cross-category achievements (5)
  { id: 'cross-prod-creative', title: 'Balanced Creator', description: 'Create 50+ notes AND edit 50+ media items', icon: 'sparkles', category: 'creator',
    condition: s => s.notesCreated >= 50 && (s.videosEdited >= 50 || s.imagesEdited >= 50 || s.musicTracksCreated >= 50), points: 75, rarity: 'epic' },
  { id: 'cross-work-play', title: 'Work-Life Balance', description: 'Complete 50+ tasks AND play 50+ games', icon: 'heart', category: 'creator',
    condition: s => s.tasksCompleted >= 50 && s.gamesPlayed >= 50, points: 60, rarity: 'rare' },
  { id: 'cross-org-create', title: 'Organized Creator', description: 'Create 50+ Kanban cards, notes, and tasks each', icon: 'columns', category: 'creator',
    condition: s => s.kanbanCardsCreated >= 50 && s.notesCreated >= 50 && s.tasksCreated >= 50, points: 100, rarity: 'epic' },
  { id: 'cross-share-create', title: 'Share What You Make', description: 'Create 50+ items and complete 25+ transfers', icon: 'share', category: 'creator',
    condition: s => (s.notesCreated >= 50 || s.imagesEdited >= 50) && s.transfersCompleted >= 25, points: 75, rarity: 'epic' },
  { id: 'cross-secure-browse', title: 'Secure Browsing', description: 'Generate 50+ passwords and open 100+ tabs', icon: 'shield', category: 'creator',
    condition: s => s.passwordsGenerated >= 50 && s.browserTabsOpened >= 100, points: 50, rarity: 'rare' },

  // Advanced mastery milestones (5)
  { id: 'mastery-500sess', title: 'Half Millennium', description: 'Complete 2,500 sessions', icon: 'trophy', category: 'mastery', condition: s => s.totalSessions >= 2500, points: 500, rarity: 'legendary' },
  { id: 'mastery-1000min', title: '10,000 Minutes', description: 'Spend 10,000 minutes in DEX', icon: 'clock', category: 'mastery', condition: s => s.totalMinutes >= 10000, points: 300, rarity: 'legendary' },
  { id: 'mastery-notes100', title: 'Library Builder', description: 'Create 1,000 notes total', icon: 'book-open', category: 'mastery', condition: s => s.notesCreated >= 1000, points: 200, rarity: 'epic' },
  { id: 'mastery-tasks200', title: 'Task Terminator', description: 'Complete 1,000 tasks total', icon: 'check', category: 'mastery', condition: s => s.tasksCompleted >= 1000, points: 250, rarity: 'legendary' },
  { id: 'mastery-allstats', title: 'Well-Rounded', description: 'Earn 25+ in 8 different stat categories', icon: 'pie-chart', category: 'mastery',
    condition: s => [s.notesCreated, s.tasksCompleted, s.filesOpened, s.gamesPlayed, s.searchesPerformed, s.workflowsCreated, s.transfersCompleted, s.passwordsGenerated, s.videosEdited, s.musicTracksCreated].filter(v => v >= 25).length >= 8,
    points: 200, rarity: 'epic' },

  // Power user extras (5)
  { id: 'power-search500', title: 'Search Sage', description: 'Perform 5,000 total searches', icon: 'search', category: 'power', condition: s => s.searchesPerformed >= 5000, points: 175, rarity: 'legendary' },
  { id: 'power-tabmaster', title: 'Tab Master', description: 'Open 2,000 browser tabs total', icon: 'globe', category: 'power', condition: s => s.browserTabsOpened >= 2000, points: 150, rarity: 'legendary' },
  { id: 'power-export-pro', title: 'Export Pro', description: 'Export data 250 times', icon: 'download', category: 'power', condition: s => s.dataExported >= 250, points: 120, rarity: 'epic' },
  { id: 'power-wf-master', title: 'Workflow Master', description: 'Create and run 250+ workflows each', icon: 'shuffle', category: 'power', condition: s => s.workflowsCreated >= 250 && s.workflowsRun >= 250, points: 175, rarity: 'legendary' },
  { id: 'power-ultimate', title: 'Ultimate Power User', description: 'Use 1,000+ shortcuts, 2,000+ searches, and 500+ spotlight', icon: 'crown', category: 'power',
    condition: s => s.shortcutsUsed >= 1000 && s.searchesPerformed >= 2000 && s.spotlightSearches >= 500, points: 400, rarity: 'legendary' },
];

// ── Category metadata ────────────────────────────────────────────────────

export const CATEGORY_META: Record<AchievementCategory, { title: string; icon: string; color: string }> = {
  explorer:  { title: 'Explorer',   icon: 'compass',    color: '#3b82f6' },
  creator:   { title: 'Creator',    icon: 'pen-tool',   color: '#8b5cf6' },
  power:     { title: 'Power User', icon: 'zap',        color: '#f59e0b' },
  media:     { title: 'Media',      icon: 'film',       color: '#ec4899' },
  gaming:    { title: 'Gaming',     icon: 'gamepad',    color: '#ef4444' },
  streak:    { title: 'Streak',     icon: 'flame',      color: '#f97316' },
  social:    { title: 'Social',     icon: 'share',      color: '#10b981' },
  mastery:   { title: 'Mastery',    icon: 'crown',      color: '#eab308' },
  discovery: { title: 'Discovery',  icon: 'sparkles',   color: '#06b6d4' },
  speed:     { title: 'Speed',      icon: 'zap',        color: '#22c55e' },
};

export const RARITY_META: Record<AchievementRarity, { title: string; color: string; glow: string; icon: string }> = {
  common:    { title: 'Common',    color: '#9ca3af', glow: 'none', icon: 'circle' },
  rare:      { title: 'Rare',      color: '#3b82f6', glow: '0 0 8px rgba(59,130,246,0.3)', icon: 'diamond' },
  epic:      { title: 'Epic',      color: '#a855f7', glow: '0 0 12px rgba(168,85,247,0.4)', icon: 'flame' },
  legendary: { title: 'Legendary', color: '#f59e0b', glow: '0 0 16px rgba(245,158,11,0.5)', icon: 'crown' },
};

// ── Validate count ───────────────────────────────────────────────────────
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
// Should be 500 — if not, the build log will tell us
if (typeof console !== 'undefined' && TOTAL_ACHIEVEMENTS !== 500) {
  console.warn(`[DEX Achievements] Expected 500 achievements, got ${TOTAL_ACHIEVEMENTS}. Delta: ${500 - TOTAL_ACHIEVEMENTS}`);
}
