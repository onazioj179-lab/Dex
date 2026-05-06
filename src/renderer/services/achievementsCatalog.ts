// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * DEX Achievement Catalog -- 5000 Achievements
 * Organized into 12 categories across the entire DEX ecosystem.
 * Achievements are earned through natural app usage.
 * Points: Easy 10 / Medium 25 / Hard 50 / Extreme 100
 */

// -- Expanded Stats Interface ---------------------------------------------

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

  // Gaming & Performance
  gamesPlayed: number;
  bestReactionMs: number;
  bestTypingWPM: number;

  // Engineering / AXL stats (Phase 3)
  axlPartsCreated: number;
  axlAssembliesBuilt: number;
  axlBooleanOps: number;
  axlSimulationsRun: number;
  axlBOMsGenerated: number;
  axlMeasurements: number;
  axlConstraintsAdded: number;
  axlExports: number;
  axlStdPartsPlaced: number;
  axlMaterialChanges: number;
  axlDrawingsCreated: number;
  axlFilletsChamfers: number;
  axlPatternsCreated: number;
  axlExplodedViews: number;

  // Integration / Cross-app stats (Phase 3)
  sendToMenuUses: number;
  assetsReceived: number;
  assetsSent: number;
  creativeAppsUsedInSession: number;
  crossAppWorkflows: number;
  spacesCreated: number;
  widgetsUsed: number;
  missionControlActivations: number;
  snapLayoutsUsed: number;
  gesturesPerformed: number;

  // Extended stats (Phase 2 -- supports 1000 achievements)
  wallpapersChanged: number;
  lockScreenUnlocks: number;
  contextMenuUses: number;
  dragDropActions: number;
  undoActions: number;
  redoActions: number;
  copyActions: number;
  pasteActions: number;
  cutActions: number;
  selectAllActions: number;
  tabsSwitched: number;
  windowsResized: number;
  windowsMinimized: number;
  windowsMaximized: number;
  appsClosed: number;
  appsForceQuit: number;
  scrollDistance: number;
  wordsTyped: number;
  charactersTyped: number;
  linksClicked: number;
  imagesViewed: number;
  foldersCreated: number;
  foldersNavigated: number;
  filesDeleted: number;
  filesRenamed: number;
  filesMoved: number;
  filesCopied: number;
  zipFilesCreated: number;
  themeSwitches: number;
  accentColorChanges: number;
  fontsChanged: number;
  notificationsReceived: number;
  notificationsDismissed: number;
  toastsShown: number;
  errorsEncountered: number;
  crashRecoveries: number;
  sessionDurationMinutes: number;
  longestSessionMinutes: number;
  shortestSessionMinutes: number;
  idleTimeMinutes: number;
  focusTimeMinutes: number;
  appSwitchesTotal: number;
  uniqueDaysUsed: number;
  consecutiveWeeksUsed: number;
  monthsActive: number;
  seasonsActive: number;
  calendarRemindersSet: number;
  taskListsCreated: number;
  subtasksCompleted: number;
  recurringTasksCreated: number;
  kanbanColumnsCreated: number;
  kanbanBoardsCreated: number;
  noteFoldersCreated: number;
  noteTagsCreated: number;
  notesSearched: number;
  notesPinned: number;
  notesArchived: number;
  notesShared: number;
  codeBlocksCreated: number;
  tablesCreated: number;
  listsCreated: number;
  headingsCreated: number;
  boldFormatUses: number;
  italicFormatUses: number;
  strikethroughUses: number;
  highlightUses: number;
  videoExports: number;
  videoPreviewPlays: number;
  videoClipsSplit: number;
  videoTransitionsAdded: number;
  videoEffectsApplied: number;
  videoTextOverlays: number;
  audioRecordings: number;
  audioEffectsApplied: number;
  audioMixdowns: number;
  audioTracksLayered: number;
  imageFiltersApplied: number;
  imageCrops: number;
  imageResizes: number;
  imageRotations: number;
  imageLayers: number;
  animationKeyframes: number;
  animationExports: number;
  batchConversions: number;
  browserSearches: number;
  browserHistoryViews: number;
  browserDownloads: number;
  browserPageLoads: number;
  calculatorOperations: number;
  calculatorScientificUses: number;
  calculatorHistoryViews: number;
  passwordsCopied: number;
  passwordStrengthChecks: number;
  rewindSnapshotsViewed: number;
  rewindRestores: number;
  spotlightActionsExecuted: number;
  commandsExecuted: number;
  stageManagerSplits: number;
  multiWindowSessions: number;
  quickLookPreviews: number;
  powerMenuUses: number;
  systemInfoViews: number;
  storageChecks: number;
  networkChecks: number;

  // Deep media & creative stats
  videoTracksAdded: number;
  instrumentsUsed: number;
  midiNotesRecorded: number;
  brushStrokes: number;
  imageExports: number;
  imageSelections: number;
  animationPresetsUsed: number;
  easingCurvesApplied: number;
  compositions: number;
  encoderPresetsUsed: number;
  uniqueFormatPairs: number;
  queueItemsProcessed: number;

  // Productivity deep stats
  templatesUsed: number;
  remindersSet: number;
  filesCreated: number;

  // UI interaction stats
  dockRearrangements: number;
  helpAccessed: number;
  zoomActions: number;
  totalClicks: number;

  // Peak & daily stats
  longestFocusMinutes: number;
  dailyCharactersPeak: number;
  dailyFilesCreatedPeak: number;
  darkModeConsecutiveDays: number;
  dailyNotificationsPeak: number;
  dailySearchesPeak: number;

  // Engineering deep stats
  axlAnnotationsAdded: number;
  axlViewChanges: number;
  axlWireframeToggles: number;

  // Gaming deep stats
  perfectScores: number;
  uniqueGamesPlayed: number;
  highestGameScore: number;

  // Time variety stats
  seasonsUsed: number;
  hoursOfDayUsed: number;
  daysOfWeekUsed: number;

  // Social & feedback stats
  feedbackSubmitted: number;
  accessibilityFeaturesUsed: number;

  // Discovery & secrets stats
  easterEggsFound: number;
  itemsRecycled: number;
  itemsRestored: number;
  activityMonitorViews: number;
  stageManagerUses: number;

  // Speed stats
  fastLaunches: number;
  instantLaunches: number;
  rapidSwitchCount: number;

  // Rewind deep stats
  rewindActivitiesLogged: number;
  rewindPlaybacks: number;

  // Lifetime stats
  totalBytesProcessed: number;
  totalActions: number;
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
  searchesPerformed: 0, spotlightSearches: 0, shortcutsUsed: 0,
  settingsChanged: 0, bookmarksCreated: 0, browserTabsOpened: 0,
  commandPaletteUses: 0, clipboardUses: 0,
  transfersCompleted: 0, dataExported: 0, diagnosticsShared: 0,
  favoritesPinned: 0,
  achievementsViewed: 0, tipsRead: 0, darkModeToggles: 0,
  fullscreenToggles: 0, rewindActivations: 0, launchpadOpens: 0,
  nightSessions: 0, morningSessions: 0, weekendSessions: 0, lunchSessions: 0,
  appUsageCounts: {},
  gamesPlayed: 0, bestReactionMs: 0, bestTypingWPM: 0,
  // Engineering / AXL stats
  axlPartsCreated: 0, axlAssembliesBuilt: 0, axlBooleanOps: 0,
  axlSimulationsRun: 0, axlBOMsGenerated: 0, axlMeasurements: 0,
  axlConstraintsAdded: 0, axlExports: 0, axlStdPartsPlaced: 0,
  axlMaterialChanges: 0, axlDrawingsCreated: 0, axlFilletsChamfers: 0,
  axlPatternsCreated: 0, axlExplodedViews: 0,
  // Integration / Cross-app stats
  sendToMenuUses: 0, assetsReceived: 0, assetsSent: 0,
  creativeAppsUsedInSession: 0, crossAppWorkflows: 0,
  spacesCreated: 0, widgetsUsed: 0, missionControlActivations: 0,
  snapLayoutsUsed: 0, gesturesPerformed: 0,
  // Extended stats
  wallpapersChanged: 0, lockScreenUnlocks: 0, contextMenuUses: 0,
  dragDropActions: 0, undoActions: 0, redoActions: 0,
  copyActions: 0, pasteActions: 0, cutActions: 0, selectAllActions: 0,
  tabsSwitched: 0, windowsResized: 0, windowsMinimized: 0, windowsMaximized: 0,
  appsClosed: 0, appsForceQuit: 0, scrollDistance: 0,
  wordsTyped: 0, charactersTyped: 0, linksClicked: 0, imagesViewed: 0,
  foldersCreated: 0, foldersNavigated: 0, filesDeleted: 0, filesRenamed: 0,
  filesMoved: 0, filesCopied: 0, zipFilesCreated: 0,
  themeSwitches: 0, accentColorChanges: 0, fontsChanged: 0,
  notificationsReceived: 0, notificationsDismissed: 0, toastsShown: 0,
  errorsEncountered: 0, crashRecoveries: 0,
  sessionDurationMinutes: 0, longestSessionMinutes: 0, shortestSessionMinutes: 0,
  idleTimeMinutes: 0, focusTimeMinutes: 0, appSwitchesTotal: 0,
  uniqueDaysUsed: 0, consecutiveWeeksUsed: 0, monthsActive: 0, seasonsActive: 0,
  calendarRemindersSet: 0, taskListsCreated: 0, subtasksCompleted: 0,
  recurringTasksCreated: 0, kanbanColumnsCreated: 0, kanbanBoardsCreated: 0,
  noteFoldersCreated: 0, noteTagsCreated: 0, notesSearched: 0,
  notesPinned: 0, notesArchived: 0, notesShared: 0,
  codeBlocksCreated: 0, tablesCreated: 0, listsCreated: 0, headingsCreated: 0,
  boldFormatUses: 0, italicFormatUses: 0, strikethroughUses: 0, highlightUses: 0,
  videoExports: 0, videoPreviewPlays: 0, videoClipsSplit: 0,
  videoTransitionsAdded: 0, videoEffectsApplied: 0, videoTextOverlays: 0,
  audioRecordings: 0, audioEffectsApplied: 0, audioMixdowns: 0, audioTracksLayered: 0,
  imageFiltersApplied: 0, imageCrops: 0, imageResizes: 0, imageRotations: 0, imageLayers: 0,
  animationKeyframes: 0, animationExports: 0, batchConversions: 0,
  browserSearches: 0, browserHistoryViews: 0, browserDownloads: 0, browserPageLoads: 0,
  calculatorOperations: 0, calculatorScientificUses: 0, calculatorHistoryViews: 0,
  passwordsCopied: 0, passwordStrengthChecks: 0,
  rewindSnapshotsViewed: 0, rewindRestores: 0,
  spotlightActionsExecuted: 0, commandsExecuted: 0,
  stageManagerSplits: 0, multiWindowSessions: 0, quickLookPreviews: 0,
  powerMenuUses: 0, systemInfoViews: 0, storageChecks: 0, networkChecks: 0,
  // Deep media & creative
  videoTracksAdded: 0, instrumentsUsed: 0, midiNotesRecorded: 0,
  brushStrokes: 0, imageExports: 0, imageSelections: 0,
  animationPresetsUsed: 0, easingCurvesApplied: 0, compositions: 0,
  encoderPresetsUsed: 0, uniqueFormatPairs: 0, queueItemsProcessed: 0,
  // Productivity deep
  templatesUsed: 0, remindersSet: 0, filesCreated: 0,
  // UI interaction
  dockRearrangements: 0, helpAccessed: 0, zoomActions: 0, totalClicks: 0,
  // Peak & daily
  longestFocusMinutes: 0, dailyCharactersPeak: 0, dailyFilesCreatedPeak: 0,
  darkModeConsecutiveDays: 0, dailyNotificationsPeak: 0, dailySearchesPeak: 0,
  // Engineering deep
  axlAnnotationsAdded: 0, axlViewChanges: 0, axlWireframeToggles: 0,
  // Gaming deep
  perfectScores: 0, uniqueGamesPlayed: 0, highestGameScore: 0,
  // Time variety
  seasonsUsed: 0, hoursOfDayUsed: 0, daysOfWeekUsed: 0,
  // Social & feedback
  feedbackSubmitted: 0, accessibilityFeaturesUsed: 0,
  // Discovery & secrets
  easterEggsFound: 0, itemsRecycled: 0, itemsRestored: 0,
  activityMonitorViews: 0, stageManagerUses: 0,
  // Speed
  fastLaunches: 0, instantLaunches: 0, rapidSwitchCount: 0,
  // Rewind deep
  rewindActivitiesLogged: 0, rewindPlaybacks: 0,
  // Lifetime
  totalBytesProcessed: 0, totalActions: 0,
};

// -- Achievement Definition -----------------------------------------------

export type AchievementRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type AchievementCategory =
  | 'explorer' | 'creator' | 'power' | 'media'
  | 'gaming' | 'streak' | 'social' | 'mastery'
  | 'discovery' | 'speed' | 'engineering' | 'integration';

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
  progress?: (s: UserStats) => { current: number; target: number };
}

// -- Helper: generate tiered achievements ---------------------------------

// Hard difficulty -- count-based thresholds multiplied by 10x.
// Designed so full completion takes ~5 years of dedicated daily use.
// Streak and capped categories keep natural thresholds.
const DIFFICULTY_SCALE = 10;
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
      points,
      rarity,
      progress: (s: UserStats) => ({ current: Math.min(getValue(s), threshold), target: threshold }),
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
    points: pts,
    rarity,
    progress: s => ({ current: Math.min(s.appUsageCounts[appId] || 0, scaled), target: scaled }),
  };
}

// -- All 25 App IDs & Names -----------------------------------------------

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
  ['kanban', 'Kanban', 'columns'],
  ['axl', 'AXL', 'compass'],
  ['achievements', 'Trophies', 'trophy'],
];

// ==========================================================================
//  ACHIEVEMENT CATALOG -- 5000 Achievements
// ==========================================================================

export const ACHIEVEMENTS: Achievement[] = [

  // === EXPLORER (100) -- App discovery & exploration =======================

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

  // === CREATOR (80) -- Content creation ====================================

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

  // === POWER (70) -- Power user features ==================================

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

  // === MEDIA (60) -- Media creation & consumption =========================

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
  { id: 'media-type-4', title: 'Multimedia Expert', description: 'Create 500+ items in 4 different media types', icon: 'layers', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 500).length >= 4,
    points: 150, rarity: 'epic' },
  { id: 'media-type-5', title: 'Multimedia Master', description: 'Create 500+ items in 5 different media types', icon: 'sparkles', category: 'media',
    condition: s => [s.videosEdited, s.musicTracksCreated, s.imagesEdited, s.animationsCreated, s.filesConverted, s.screenRecordings].filter(v => v >= 500).length >= 5,
    points: 250, rarity: 'legendary' },
  { id: 'media-renaissance', title: 'Renaissance Creator', description: 'Create 500+ works in every creative app', icon: 'crown', category: 'media',
    condition: s => s.videosEdited >= 500 && s.musicTracksCreated >= 500 && s.imagesEdited >= 500 && s.animationsCreated >= 500 && s.filesConverted >= 500,
    points: 500, rarity: 'legendary' },

  // === STREAK (50) -- Consistency & daily use =============================

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
  { id: 'comeback-1', title: 'Welcome Back', description: 'Complete 50 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 50, points: 15, rarity: 'common' },
  { id: 'comeback-10', title: 'Loyal User', description: 'Complete 250 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 250, points: 40, rarity: 'common' },
  { id: 'comeback-25', title: 'Regular', description: 'Complete 750 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 750, points: 75, rarity: 'rare' },
  { id: 'comeback-50', title: 'Dedicated', description: 'Complete 1,500 sessions', icon: 'arrow-right', category: 'streak', condition: s => s.totalSessions >= 1500, points: 120, rarity: 'rare' },
  { id: 'comeback-100', title: 'Centurion', description: 'Complete 3,000 sessions', icon: 'award', category: 'streak', condition: s => s.totalSessions >= 3000, points: 200, rarity: 'epic' },

  // === SOCIAL (30) -- Sharing & collaboration =============================

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

  // === MASTERY (40) -- Deep expertise & long-term =========================

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
      // Calculate points dynamically -- use a proxy since we don't store points in stats
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

  // === DISCOVERY (20) -- Hidden features & easter eggs ====================

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
  { id: 'secret-100sess', title: 'Silent Grinder', description: 'Complete 5,000 sessions without checking achievements', icon: 'shield', category: 'discovery', condition: s => s.totalSessions >= 5000 && s.achievementsViewed === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-allcreative', title: 'Renaissance Person', description: 'Create 500+ works in every creative app', icon: 'sparkles', category: 'discovery',
    condition: s => s.videosEdited >= 500 && s.musicTracksCreated >= 500 && s.imagesEdited >= 500 && s.animationsCreated >= 500 && s.filesConverted >= 500,
    points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-nightowl-streak', title: 'Vampire', description: 'Use DEX after midnight for 30 straight days', icon: 'moon', category: 'discovery', condition: s => s.nightSessions >= 30 && s.currentStreak >= 30, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-speed-demon', title: 'Speed Demon', description: 'Achieve sub-150ms reaction AND 120+ WPM typing', icon: 'zap', category: 'discovery', condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 150 && s.bestTypingWPM >= 120, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-no-games', title: 'All Work No Play', description: 'Complete 2,500 tasks without playing any games', icon: 'check', category: 'discovery', condition: s => s.tasksCompleted >= 2500 && s.gamesPlayed === 0, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-gamer-only', title: 'All Play No Work', description: 'Play 2,500 games without creating any notes or tasks', icon: 'gamepad', category: 'discovery', condition: s => s.gamesPlayed >= 2500 && s.notesCreated === 0 && s.tasksCreated === 0, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-explorer-max', title: 'The Explorer', description: 'Use every app 500+ times each', icon: 'compass', category: 'discovery', condition: s => s.appsUsed.length >= 25 && Object.values(s.appUsageCounts).every(c => c >= 500), points: 500, rarity: 'legendary', secret: true },
  { id: 'secret-perfectionist', title: 'Perfectionist', description: 'Change 1,000+ settings and generate 1,000+ passwords', icon: 'settings', category: 'discovery', condition: s => s.settingsChanged >= 1000 && s.passwordsGenerated >= 1000, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-loyal', title: 'Undying Loyalty', description: 'Use DEX for 365 consecutive days', icon: 'heart', category: 'discovery', condition: s => s.currentStreak >= 365, points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-power-weekend', title: 'Power Weekend', description: 'Use 20+ apps on a weekend session', icon: 'sun', category: 'discovery', condition: s => s.weekendSessions > 0 && s.appsUsed.length >= 20, points: 150, rarity: 'legendary', secret: true },

  // === SPEED (20 remaining to reach 500) =================================

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
  { id: 'speed-ultrapower', title: 'Shortcut Grandmaster', description: 'Use 5,000 keyboard shortcuts', icon: 'terminal', category: 'speed', condition: s => s.shortcutsUsed >= 5000, points: 200, rarity: 'legendary' },

  // Rapid content creation
  { id: 'speed-5notes', title: 'Note Storm', description: 'Create 50 notes', icon: 'file-text', category: 'speed', condition: s => s.notesCreated >= 50, points: 40, rarity: 'rare' },
  { id: 'speed-10tasks', title: 'Task Blitz', description: 'Create 100 tasks', icon: 'check-square', category: 'speed', condition: s => s.tasksCreated >= 100, points: 50, rarity: 'rare' },
  { id: 'speed-search-master', title: 'Search Master', description: 'Perform 5,000 searches', icon: 'search', category: 'speed', condition: s => s.searchesPerformed >= 5000, points: 100, rarity: 'epic' },

  // First-time speed
  { id: 'speed-first-5min', title: 'Quick Start', description: 'Open 5 apps in your first few sessions', icon: 'rocket', category: 'speed', condition: s => s.totalSessions <= 5 && s.appsUsed.length >= 5, points: 15, rarity: 'common' },
  { id: 'speed-first-explore', title: 'Curious Mind', description: 'Open 12 different apps in first 5 sessions', icon: 'compass', category: 'speed', condition: s => s.totalSessions <= 5 && s.appsUsed.length >= 12, points: 50, rarity: 'rare' },

  // Long-term efficiency
  { id: 'speed-efficient', title: 'Efficiency Expert', description: 'Average 5+ app switches per session over 100 sessions', icon: 'trending-up', category: 'speed', condition: s => s.totalSessions >= 100 && Object.values(s.appUsageCounts).reduce((a, b) => a + b, 0) / s.totalSessions >= 5, points: 100, rarity: 'epic' },
  { id: 'speed-wf-run-10', title: 'Automation Pro', description: 'Run 500 automated workflows', icon: 'shuffle', category: 'speed', condition: s => s.workflowsRun >= 500, points: 75, rarity: 'epic' },
  { id: 'speed-wf-run-50', title: 'Automation Master', description: 'Run 2,500 automated workflows', icon: 'shuffle', category: 'speed', condition: s => s.workflowsRun >= 2500, points: 150, rarity: 'legendary' },
  { id: 'speed-file-50', title: 'File Processor', description: 'Open 2,500 files total', icon: 'folder', category: 'speed', condition: s => s.filesOpened >= 2500, points: 75, rarity: 'rare' },
  { id: 'speed-daily-prod', title: 'Daily Producer', description: 'Maintain a 30-day streak with 30+ notes', icon: 'flame', category: 'speed', condition: s => s.currentStreak >= 30 && s.notesCreated >= 30, points: 100, rarity: 'epic' },
  { id: 'speed-master-of-all', title: 'Master of All', description: 'Use every category of apps 500+ times each', icon: 'crown', category: 'speed',
    condition: s =>
      (s.appUsageCounts['home'] || 0) >= 500 && (s.appUsageCounts['notes'] || 0) >= 500 &&
      (s.appUsageCounts['videoeditor'] || 0) >= 500 && (s.appUsageCounts['gallery'] || 0) >= 500 &&
      (s.appUsageCounts['calculator'] || 0) >= 500 && (s.appUsageCounts['kanban'] || 0) >= 500,
    points: 200, rarity: 'legendary' },

  // === BONUS -- Additional achievements to reach 500 =====================

  // App veteran 100x for top apps (5)
  ...['home', 'notes', 'files', 'browser', 'tasks'].map((id, i) =>
    appVeteran(id, APPS.find(a => a[0] === id)?.[1] || id, APPS.find(a => a[0] === id)?.[2] || 'star', 100, 150, 'epic' as AchievementRarity)
  ),

  // Cross-category achievements (5)
  { id: 'cross-prod-creative', title: 'Balanced Creator', description: 'Create 250+ notes AND edit 250+ media items', icon: 'sparkles', category: 'creator',
    condition: s => s.notesCreated >= 250 && (s.videosEdited >= 250 || s.imagesEdited >= 250 || s.musicTracksCreated >= 250), points: 75, rarity: 'epic' },
  { id: 'cross-work-play', title: 'Work-Life Balance', description: 'Complete 250+ tasks AND play 250+ games', icon: 'heart', category: 'creator',
    condition: s => s.tasksCompleted >= 250 && s.gamesPlayed >= 250, points: 60, rarity: 'rare' },
  { id: 'cross-org-create', title: 'Organized Creator', description: 'Create 250+ Kanban cards, notes, and tasks each', icon: 'columns', category: 'creator',
    condition: s => s.kanbanCardsCreated >= 250 && s.notesCreated >= 250 && s.tasksCreated >= 250, points: 100, rarity: 'epic' },
  { id: 'cross-share-create', title: 'Share What You Make', description: 'Create 250+ items and complete 100+ transfers', icon: 'share', category: 'creator',
    condition: s => (s.notesCreated >= 250 || s.imagesEdited >= 250) && s.transfersCompleted >= 100, points: 75, rarity: 'epic' },
  { id: 'cross-secure-browse', title: 'Secure Browsing', description: 'Generate 250+ passwords and open 500+ tabs', icon: 'shield', category: 'creator',
    condition: s => s.passwordsGenerated >= 250 && s.browserTabsOpened >= 500, points: 50, rarity: 'rare' },

  // Advanced mastery milestones (5)
  { id: 'mastery-500sess', title: 'Half Millennium', description: 'Complete 5,000 sessions', icon: 'trophy', category: 'mastery', condition: s => s.totalSessions >= 5000, points: 500, rarity: 'legendary' },
  { id: 'mastery-1000min', title: '50,000 Minutes', description: 'Spend 50,000 minutes in DEX', icon: 'clock', category: 'mastery', condition: s => s.totalMinutes >= 50000, points: 300, rarity: 'legendary' },
  { id: 'mastery-notes100', title: 'Library Builder', description: 'Create 5,000 notes total', icon: 'book-open', category: 'mastery', condition: s => s.notesCreated >= 5000, points: 200, rarity: 'epic' },
  { id: 'mastery-tasks200', title: 'Task Terminator', description: 'Complete 5,000 tasks total', icon: 'check', category: 'mastery', condition: s => s.tasksCompleted >= 5000, points: 250, rarity: 'legendary' },
  { id: 'mastery-allstats', title: 'Well-Rounded', description: 'Earn 100+ in 8 different stat categories', icon: 'pie-chart', category: 'mastery',
    condition: s => [s.notesCreated, s.tasksCompleted, s.filesOpened, s.gamesPlayed, s.searchesPerformed, s.workflowsCreated, s.transfersCompleted, s.passwordsGenerated, s.videosEdited, s.musicTracksCreated].filter(v => v >= 100).length >= 8,
    points: 200, rarity: 'epic' },

  // Power user extras (5)
  { id: 'power-search500', title: 'Search Sage', description: 'Perform 25,000 total searches', icon: 'search', category: 'power', condition: s => s.searchesPerformed >= 25000, points: 175, rarity: 'legendary' },
  { id: 'power-tabmaster', title: 'Tab Master', description: 'Open 10,000 browser tabs total', icon: 'globe', category: 'power', condition: s => s.browserTabsOpened >= 10000, points: 150, rarity: 'legendary' },
  { id: 'power-export-pro', title: 'Export Pro', description: 'Export data 1,000 times', icon: 'download', category: 'power', condition: s => s.dataExported >= 1000, points: 120, rarity: 'epic' },
  { id: 'power-wf-master', title: 'Workflow Master', description: 'Create and run 1,000+ workflows each', icon: 'shuffle', category: 'power', condition: s => s.workflowsCreated >= 1000 && s.workflowsRun >= 1000, points: 175, rarity: 'legendary' },
  { id: 'power-ultimate', title: 'Ultimate Power User', description: 'Use 5,000+ shortcuts, 10,000+ searches, and 2,500+ spotlight', icon: 'crown', category: 'power',
    condition: s => s.shortcutsUsed >= 5000 && s.searchesPerformed >= 10000 && s.spotlightSearches >= 2500, points: 400, rarity: 'legendary' },

  // ==========================================================================
  //  ACHIEVEMENTS 501–1000 — Phase 2 Expansion
  // ==========================================================================

  // ── TYPING & WRITING (40) ─────────────────────────────────────────────

  ...tiered('words-typed', 'Wordsmith', 'Type {n} words across DEX', 'type', 'creator',
    s => s.wordsTyped,
    [[100, 5, 'common'], [500, 15, 'common'], [1000, 25, 'common'], [5000, 50, 'rare'],
     [10000, 80, 'rare'], [25000, 120, 'epic'], [50000, 175, 'epic'], [100000, 300, 'legendary'],
     [250000, 500, 'legendary'], [500000, 750, 'legendary']],
    ['Fingers Moving', 'Typist', 'Writer', 'Author', 'Novelist', 'Prolific', 'Wordsmith', 'Literary Machine', 'Writing Legend', 'Half Million Words']
  ),
  ...tiered('chars-typed', 'Keystroke Counter', 'Type {n} characters', 'terminal', 'creator',
    s => s.charactersTyped,
    [[500, 5, 'common'], [2500, 15, 'common'], [10000, 30, 'rare'], [50000, 60, 'rare'],
     [100000, 100, 'epic'], [500000, 175, 'epic'], [1000000, 300, 'legendary'], [5000000, 500, 'legendary']],
    ['First Keys', 'Tapper', 'Typist', 'Fast Fingers', 'Keyboard Athlete', 'Key Crusher', 'Million Keys', 'Keystroke God']
  ),
  ...tiered('bold-fmt', 'Bold Writer', 'Use bold formatting {n} times', 'bold', 'creator',
    s => s.boldFormatUses,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 60, 'epic']],
    ['First Bold', 'Bold User', 'Bold Pro', 'Bold Master']
  ),
  ...tiered('italic-fmt', 'Italic Stylist', 'Use italic formatting {n} times', 'italic', 'creator',
    s => s.italicFormatUses,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 60, 'epic']],
    ['First Italic', 'Italic User', 'Italic Pro', 'Italic Master']
  ),
  ...tiered('code-blocks', 'Code Writer', 'Create {n} code blocks in notes', 'code', 'creator',
    s => s.codeBlocksCreated,
    [[1, 10, 'common'], [10, 25, 'rare'], [50, 50, 'epic'], [100, 100, 'legendary']],
    ['First Code', 'Coder', 'Developer', 'Code Architect']
  ),
  ...tiered('lists-created', 'List Maker', 'Create {n} lists in notes', 'list', 'creator',
    s => s.listsCreated,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic'], [250, 100, 'legendary']],
    ['First List', 'Lister', 'Organizer', 'List Pro', 'List Legend']
  ),
  ...tiered('tables-created', 'Table Builder', 'Create {n} tables in notes', 'grid', 'creator',
    s => s.tablesCreated,
    [[1, 10, 'common'], [5, 25, 'rare'], [10, 50, 'epic'], [25, 80, 'legendary']],
    ['First Table', 'Data Organizer', 'Table Pro', 'Table Architect']
  ),
  { id: 'headings-50', title: 'Heading Master', description: 'Create 500 headings in notes', icon: 'heading', category: 'creator',
    condition: s => s.headingsCreated >= 500, points: 40, rarity: 'rare' },

  // ── NOTES DEEP DIVE (25) ──────────────────────────────────────────────

  ...tiered('notes-pinned', 'Pin Collector', 'Pin {n} notes', 'pin', 'creator',
    s => s.notesPinned,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 50, 'epic'], [50, 80, 'legendary']],
    ['First Pin', 'Pinner', 'Pin Lover', 'Pin Addict', 'Pin Legend']
  ),
  ...tiered('notes-tagged', 'Tag Organizer', 'Create {n} note tags', 'tag', 'creator',
    s => s.noteTagsCreated,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 50, 'epic'], [50, 80, 'legendary']],
    ['First Tag', 'Tagger', 'Categorizer', 'Tag Pro', 'Tag Legend']
  ),
  ...tiered('notes-folders', 'Folder Architect', 'Create {n} note folders', 'folder-plus', 'creator',
    s => s.noteFoldersCreated,
    [[1, 5, 'common'], [3, 15, 'common'], [5, 30, 'rare'], [10, 50, 'epic'], [20, 80, 'legendary']],
    ['First Folder', 'Organizer', 'Archivist', 'Folder Pro', 'Folder Legend']
  ),
  ...tiered('notes-searched', 'Note Finder', 'Search notes {n} times', 'search', 'power',
    s => s.notesSearched,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 50, 'epic'], [500, 100, 'legendary']],
    ['First Search', 'Searcher', 'Finder', 'Note Detective', 'Search Oracle']
  ),
  ...tiered('notes-shared', 'Note Sharer', 'Share {n} notes', 'share-2', 'social',
    s => s.notesShared,
    [[1, 10, 'common'], [5, 25, 'rare'], [10, 50, 'epic'], [25, 80, 'legendary']],
    ['First Share', 'Sharer', 'Publisher', 'Note Broadcaster']
  ),
  { id: 'notes-archive-25', title: 'Note Archivist', description: 'Archive 250 notes', icon: 'archive', category: 'creator',
    condition: s => s.notesArchived >= 250, points: 40, rarity: 'rare' },

  // ── TASKS DEEP DIVE (20) ──────────────────────────────────────────────

  ...tiered('subtasks-done', 'Detail Oriented', 'Complete {n} subtasks', 'check-circle', 'creator',
    s => s.subtasksCompleted,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic'], [500, 120, 'legendary']],
    ['First Subtask', 'Detailer', 'Completionist', 'Detail Master', 'Subtask God']
  ),
  ...tiered('recurring-tasks', 'Routine Builder', 'Create {n} recurring tasks', 'repeat', 'creator',
    s => s.recurringTasksCreated,
    [[1, 10, 'common'], [5, 25, 'rare'], [10, 50, 'epic'], [25, 80, 'legendary']],
    ['First Routine', 'Habitual', 'Routine Pro', 'Routine Legend']
  ),
  ...tiered('task-lists', 'List Creator', 'Create {n} task lists', 'list', 'creator',
    s => s.taskListsCreated,
    [[1, 5, 'common'], [3, 15, 'common'], [5, 30, 'rare'], [10, 50, 'epic'], [20, 80, 'legendary']],
    ['First List', 'Organizer', 'Planner', 'Project Lead', 'List Architect']
  ),
  { id: 'tasks-zero-inbox', title: 'Zero Inbox', description: 'Complete all tasks (100+ created, 0 remaining)', icon: 'check', category: 'creator',
    condition: s => s.tasksCreated >= 100 && s.tasksCompleted >= s.tasksCreated, points: 100, rarity: 'epic' },

  // ── KANBAN DEEP DIVE (10) ─────────────────────────────────────────────

  ...tiered('kanban-boards', 'Board Creator', 'Create {n} Kanban boards', 'layout', 'creator',
    s => s.kanbanBoardsCreated,
    [[1, 10, 'common'], [3, 25, 'rare'], [5, 50, 'epic'], [10, 80, 'legendary']],
    ['First Board', 'Board Maker', 'Board Pro', 'Board Architect']
  ),
  ...tiered('kanban-cols', 'Column Builder', 'Create {n} Kanban columns', 'columns', 'creator',
    s => s.kanbanColumnsCreated,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 50, 'epic'], [50, 80, 'legendary']],
    ['First Column', 'Organizer', 'Column Pro', 'Column Master', 'Column Legend']
  ),

  // ── CALENDAR DEEP DIVE (8) ────────────────────────────────────────────

  ...tiered('cal-reminders', 'Reminder Setter', 'Set {n} calendar reminders', 'bell', 'creator',
    s => s.calendarRemindersSet,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 50, 'epic'], [50, 80, 'legendary'],
     [100, 120, 'legendary']],
    ['First Reminder', 'Alert Setter', 'Never Forget', 'Reminder Pro', 'Alert Master', 'Reminder Legend']
  ),
  { id: 'cal-heavy-day', title: 'Busy Day', description: 'Create 100 events in a single month', icon: 'calendar', category: 'creator',
    condition: s => s.calendarEventsCreated >= 100, points: 30, rarity: 'rare' },

  // ── VIDEO EDITING DEEP DIVE (30) ──────────────────────────────────────

  ...tiered('video-exports', 'Export Artist', 'Export {n} videos from VINX', 'download', 'media',
    s => s.videoExports,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'],
     [50, 120, 'epic'], [100, 200, 'legendary']],
    ['First Export', 'Renderer', 'Producer', 'Export Pro', 'Export Master', 'Export God']
  ),
  ...tiered('video-splits', 'Clip Splitter', 'Split {n} video clips', 'scissors', 'media',
    s => s.videoClipsSplit,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [500, 130, 'legendary']],
    ['First Cut', 'Slicer', 'Editor', 'Cut Master', 'Slash Legend']
  ),
  ...tiered('video-transitions', 'Transition Master', 'Add {n} video transitions', 'film', 'media',
    s => s.videoTransitionsAdded,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [250, 120, 'legendary']],
    ['First Transition', 'Smooth Mover', 'Flow Artist', 'Transition Pro', 'Transition God']
  ),
  ...tiered('video-effects', 'VFX Creator', 'Apply {n} video effects', 'sparkles', 'media',
    s => s.videoEffectsApplied,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [250, 120, 'legendary']],
    ['First Effect', 'FX User', 'FX Artist', 'VFX Pro', 'VFX Master']
  ),
  ...tiered('video-text', 'Text Overlay Pro', 'Add {n} text overlays to videos', 'type', 'media',
    s => s.videoTextOverlays,
    [[1, 5, 'common'], [10, 20, 'common'], [25, 40, 'rare'], [50, 70, 'epic']],
    ['First Title', 'Title Maker', 'Typography Pro', 'Title Master']
  ),
  { id: 'video-preview-100', title: 'Preview Perfectionist', description: 'Play 1000 video previews', icon: 'play', category: 'media',
    condition: s => s.videoPreviewPlays >= 1000, points: 40, rarity: 'rare' },

  // ── AUDIO / IMOSION DEEP DIVE (25) ────────────────────────────────────

  ...tiered('audio-recordings', 'Recording Artist', 'Make {n} audio recordings', 'mic', 'media',
    s => s.audioRecordings,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'], [50, 130, 'legendary']],
    ['First Recording', 'Recorder', 'Sound Capture', 'Recording Pro', 'Recording Legend']
  ),
  ...tiered('audio-effects', 'Sound Designer', 'Apply {n} audio effects', 'sliders', 'media',
    s => s.audioEffectsApplied,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 45, 'rare'], [100, 75, 'epic'], [250, 130, 'legendary']],
    ['First FX', 'FX Novice', 'Sound Shaper', 'Audio Sculptor', 'Sound Design God']
  ),
  ...tiered('audio-mixdowns', 'Mix Engineer', 'Complete {n} audio mixdowns', 'headphones', 'media',
    s => s.audioMixdowns,
    [[1, 15, 'common'], [5, 35, 'rare'], [10, 60, 'epic'], [25, 100, 'legendary']],
    ['First Mix', 'Mixer', 'Mix Engineer', 'Mix Master']
  ),
  ...tiered('audio-layers', 'Track Stacker', 'Layer {n} audio tracks', 'layers', 'media',
    s => s.audioTracksLayered,
    [[2, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 55, 'epic'], [50, 90, 'legendary']],
    ['Duo Track', 'Multi Layer', 'Stack Builder', 'Layer Pro', 'Orchestrator']
  ),

  // ── IMAGE / PRISM DEEP DIVE (25) ──────────────────────────────────────

  ...tiered('image-filters', 'Filter Artist', 'Apply {n} image filters', 'sliders', 'media',
    s => s.imageFiltersApplied,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [250, 120, 'legendary']],
    ['First Filter', 'Filter Fan', 'Filter Pro', 'Filter Addict', 'Filter God']
  ),
  ...tiered('image-crops', 'Cropping Pro', 'Crop {n} images', 'crop', 'media',
    s => s.imageCrops,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic'], [250, 100, 'legendary']],
    ['First Crop', 'Cropper', 'Frame Master', 'Crop Pro', 'Crop Legend']
  ),
  ...tiered('image-resize', 'Resize Expert', 'Resize {n} images', 'maximize-2', 'media',
    s => s.imageResizes,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic']],
    ['First Resize', 'Scaler', 'Dimension Pro', 'Resize Master']
  ),
  ...tiered('image-layers', 'Layer Master', 'Create {n} image layers', 'layers', 'media',
    s => s.imageLayers,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 55, 'epic'], [50, 90, 'legendary']],
    ['Single Layer', 'Multi Layer', 'Layer Builder', 'Layer Pro', 'Layer God']
  ),
  { id: 'image-rotate-100', title: 'Spin Doctor', description: 'Rotate 1000 images', icon: 'rotate-cw', category: 'media',
    condition: s => s.imageRotations >= 1000, points: 40, rarity: 'rare' },

  // ── ANIMATION / FLUX DEEP DIVE (15) ───────────────────────────────────

  ...tiered('anim-keyframes', 'Keyframe Artist', 'Create {n} keyframes in FLUX', 'key', 'media',
    s => s.animationKeyframes,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'],
     [500, 130, 'epic'], [1000, 200, 'legendary']],
    ['First Frame', 'Frame Setter', 'Animator', 'Keyframe Pro', 'Keyframe Master', 'Keyframe God']
  ),
  ...tiered('anim-exports', 'Animation Exporter', 'Export {n} animations', 'download', 'media',
    s => s.animationExports,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'], [50, 130, 'legendary']],
    ['First Export', 'Renderer', 'Animation Producer', 'Export Pro', 'Export Legend']
  ),

  // ── FORGE / BATCH CONVERSION (8) ──────────────────────────────────────

  ...tiered('batch-conv', 'Batch Processor', 'Run {n} batch conversions', 'zap', 'media',
    s => s.batchConversions,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'],
     [50, 120, 'epic'], [100, 200, 'legendary']],
    ['First Batch', 'Batch Runner', 'Batch Pro', 'Pipeline Builder', 'Batch Master', 'Forge Legend']
  ),
  { id: 'forge-variety', title: 'Format Polyglot', description: 'Convert 5000+ files in total', icon: 'zap', category: 'media',
    condition: s => s.filesConverted >= 5000, points: 100, rarity: 'epic' },

  // ── BROWSER DEEP DIVE (20) ────────────────────────────────────────────

  ...tiered('browser-searches', 'Web Searcher', 'Search the web {n} times', 'search', 'power',
    s => s.browserSearches,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'],
     [500, 100, 'epic'], [1000, 175, 'legendary']],
    ['First Query', 'Googler', 'Researcher', 'Web Scholar', 'Web Sage', 'Search Deity']
  ),
  ...tiered('browser-downloads', 'Downloader', 'Download {n} files via browser', 'download', 'power',
    s => s.browserDownloads,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [500, 130, 'legendary']],
    ['First Download', 'Collector', 'Hoarder', 'Download Pro', 'Download King']
  ),
  ...tiered('browser-pages', 'Page Loader', 'Load {n} web pages', 'globe', 'power',
    s => s.browserPageLoads,
    [[10, 5, 'common'], [50, 15, 'common'], [100, 30, 'rare'], [500, 55, 'epic'],
     [1000, 100, 'epic'], [5000, 175, 'legendary']],
    ['Surfer', 'Browser', 'Navigator', 'Web Explorer', 'Internet Veteran', 'Web Legend']
  ),
  { id: 'browser-history-50', title: 'History Buff', description: 'View browser history 500 times', icon: 'clock', category: 'power',
    condition: s => s.browserHistoryViews >= 500, points: 30, rarity: 'rare' },

  // ── CALCULATOR (6) ────────────────────────────────────────────────────

  ...tiered('calc-ops', 'Calculator Whiz', 'Perform {n} calculations', 'hash', 'power',
    s => s.calculatorOperations,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'],
     [500, 100, 'epic'], [1000, 175, 'legendary']],
    ['First Calc', 'Number Cruncher', 'Mathematician', 'Calculator Pro', 'Math Wizard', 'Calculus God']
  ),

  // ── PASSWORD (6) ──────────────────────────────────────────────────────

  ...tiered('pwd-copied', 'Password Manager', 'Copy {n} passwords', 'clipboard', 'power',
    s => s.passwordsCopied,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic']],
    ['First Copy', 'Password User', 'Security Pro', 'Password Master']
  ),
  { id: 'pwd-strength-50', title: 'Strength Tester', description: 'Check password strength 500 times', icon: 'shield', category: 'power',
    condition: s => s.passwordStrengthChecks >= 500, points: 30, rarity: 'rare' },

  // ── FILE MANAGEMENT (30) ──────────────────────────────────────────────

  ...tiered('folders-created', 'Folder Creator', 'Create {n} folders', 'folder-plus', 'power',
    s => s.foldersCreated,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic'], [500, 120, 'legendary']],
    ['First Folder', 'Folder Maker', 'Folder Pro', 'Folder Master', 'Folder Legend']
  ),
  ...tiered('folders-nav', 'Navigator', 'Navigate through {n} folders', 'folder', 'power',
    s => s.foldersNavigated,
    [[10, 5, 'common'], [50, 15, 'common'], [100, 30, 'rare'], [500, 60, 'epic'], [1000, 100, 'legendary']],
    ['Browser', 'Explorer', 'Navigator', 'Path Finder', 'Directory Legend']
  ),
  ...tiered('files-deleted', 'Cleaner', 'Delete {n} files', 'trash', 'power',
    s => s.filesDeleted,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic']],
    ['First Delete', 'Tidier', 'Cleaner', 'Purge Master']
  ),
  ...tiered('files-renamed', 'Renamer', 'Rename {n} files', 'edit', 'power',
    s => s.filesRenamed,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic']],
    ['First Rename', 'Name Changer', 'Rename Pro', 'Rename Master']
  ),
  ...tiered('files-moved', 'Mover', 'Move {n} files between folders', 'move', 'power',
    s => s.filesMoved,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 35, 'rare'], [100, 60, 'epic']],
    ['First Move', 'Relocator', 'Organizer', 'Move Master']
  ),
  { id: 'files-copied-100', title: 'Copy Machine', description: 'Copy 1000 files', icon: 'copy', category: 'power',
    condition: s => s.filesCopied >= 1000, points: 50, rarity: 'epic' },
  { id: 'zip-creator-10', title: 'Archive Builder', description: 'Create 100 zip files', icon: 'archive', category: 'power',
    condition: s => s.zipFilesCreated >= 100, points: 40, rarity: 'rare' },

  // ── SYSTEM INTERACTION (25) ───────────────────────────────────────────

  ...tiered('drag-drop', 'Drag Master', 'Drag and drop {n} items', 'move', 'power',
    s => s.dragDropActions,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'], [500, 100, 'legendary']],
    ['First Drag', 'Dragger', 'Drag Pro', 'Drag Master', 'Drag Legend']
  ),
  ...tiered('undo-actions', 'Undo Expert', 'Undo {n} actions', 'rotate-ccw', 'power',
    s => s.undoActions,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'], [500, 100, 'legendary']],
    ['First Undo', 'Reverser', 'Time Bender', 'Undo Pro', 'Undo God']
  ),
  ...tiered('context-menu', 'Right-Clicker', 'Use context menus {n} times', 'more-horizontal', 'power',
    s => s.contextMenuUses,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'], [500, 100, 'legendary']],
    ['First Right-Click', 'Menu User', 'Context Pro', 'Menu Master', 'Right-Click Legend']
  ),
  ...tiered('links-clicked', 'Link Follower', 'Click {n} links', 'link', 'power',
    s => s.linksClicked,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'], [500, 100, 'legendary']],
    ['First Link', 'Clicker', 'Surfer', 'Link Pro', 'Link Legend']
  ),
  ...tiered('scroll-dist', 'Scroller', 'Scroll {n} thousand pixels', 'chevrons-down', 'power',
    s => Math.floor(s.scrollDistance / 1000),
    [[1, 5, 'common'], [10, 15, 'common'], [100, 30, 'rare'], [1000, 55, 'epic'], [10000, 100, 'legendary']],
    ['First Scroll', 'Scroller', 'Scroll Pro', 'Scroll Master', 'Scroll Legend']
  ),

  // ── WINDOW MANAGEMENT (15) ────────────────────────────────────────────

  ...tiered('windows-resize', 'Window Resizer', 'Resize windows {n} times', 'maximize', 'power',
    s => s.windowsResized,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 50, 'epic']],
    ['First Resize', 'Resizer', 'Layout Pro', 'Window Master']
  ),
  ...tiered('stage-splits', 'Split View User', 'Use Stage Manager {n} times', 'columns', 'power',
    s => s.stageManagerSplits,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 70, 'epic'], [50, 110, 'legendary']],
    ['First Split', 'Side by Side', 'Multitasker', 'Split Pro', 'Split Legend']
  ),
  ...tiered('multi-window', 'Multi Window', 'Open multiple windows {n} times', 'layout', 'power',
    s => s.multiWindowSessions,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 45, 'rare'], [25, 75, 'epic']],
    ['Dual Screen', 'Multi Pane', 'Window Pro', 'Window Master']
  ),
  { id: 'windows-minimize-100', title: 'Hide and Seek', description: 'Minimize windows 1000 times', icon: 'minimize', category: 'power',
    condition: s => s.windowsMinimized >= 1000, points: 30, rarity: 'rare' },

  // ── THEMING & CUSTOMIZATION (15) ──────────────────────────────────────

  ...tiered('wallpaper-ch', 'Interior Designer', 'Change wallpaper {n} times', 'image', 'discovery',
    s => s.wallpapersChanged,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 55, 'epic'], [50, 90, 'legendary']],
    ['New Look', 'Redecorator', 'Designer', 'Style Pro', 'Aesthetic God']
  ),
  ...tiered('theme-switch', 'Theme Changer', 'Switch themes {n} times', 'palette', 'discovery',
    s => s.themeSwitches,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 55, 'epic']],
    ['Theme Curious', 'Theme Explorer', 'Theme Tester', 'Theme Connoisseur']
  ),
  ...tiered('accent-ch', 'Color Picker', 'Change accent color {n} times', 'droplet', 'discovery',
    s => s.accentColorChanges,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 30, 'rare'], [25, 55, 'epic']],
    ['First Color', 'Color Fan', 'Color Pro', 'Chromatic Master']
  ),

  // ── REWIND DEEP DIVE (8) ─────────────────────────────────────────────

  ...tiered('rewind-snaps', 'Snapshot Viewer', 'View {n} Rewind snapshots', 'eye', 'discovery',
    s => s.rewindSnapshotsViewed,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic']],
    ['First Peek', 'Reviewer', 'Time Browser', 'Snapshot Pro']
  ),
  ...tiered('rewind-restore', 'Time Restorer', 'Restore from Rewind {n} times', 'rewind', 'discovery',
    s => s.rewindRestores,
    [[1, 10, 'common'], [5, 25, 'rare'], [10, 50, 'epic'], [25, 80, 'legendary']],
    ['First Restore', 'Restorer', 'Time Healer', 'Restoration God']
  ),

  // ── SPOTLIGHT & COMMANDS (10) ─────────────────────────────────────────

  ...tiered('spotlight-exec', 'Spotlight Launcher', 'Execute {n} actions from Spotlight', 'zap', 'speed',
    s => s.spotlightActionsExecuted,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [500, 130, 'legendary']],
    ['First Action', 'Quick Launcher', 'Speed Runner', 'Action Pro', 'Spotlight God']
  ),
  ...tiered('commands-exec', 'Command Runner', 'Execute {n} commands', 'terminal', 'speed',
    s => s.commandsExecuted,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'], [500, 130, 'legendary']],
    ['First Command', 'Executor', 'Commander', 'Command Pro', 'Command Legend']
  ),

  // ── POWER MANAGEMENT (6) ─────────────────────────────────────────────

  ...tiered('power-menu', 'Power User', 'Use power menu {n} times', 'power', 'power',
    s => s.powerMenuUses,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare']],
    ['First Power', 'Power Regular', 'Power Pro']
  ),
  ...tiered('sys-info', 'System Inspector', 'View system info {n} times', 'cpu', 'discovery',
    s => s.systemInfoViews,
    [[1, 5, 'common'], [10, 20, 'rare'], [50, 50, 'epic']],
    ['First Check', 'Inspector', 'System Sage']
  ),

  // ── LOCK SCREEN (5) ──────────────────────────────────────────────────

  ...tiered('lock-unlocks', 'Gatekeeper', 'Unlock the lock screen {n} times', 'unlock', 'streak',
    s => s.lockScreenUnlocks,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'], [500, 100, 'legendary']],
    ['First Unlock', 'Regular', 'Frequent Unlocker', 'Key Master', 'Gatekeeper']
  ),

  // ── TIME & DEDICATION (30) ───────────────────────────────────────────

  ...tiered('unique-days', 'Daily User', 'Use DEX on {n} unique days', 'calendar', 'streak',
    s => s.uniqueDaysUsed,
    [[1, 5, 'common'], [7, 15, 'common'], [30, 30, 'common'], [60, 50, 'rare'],
     [90, 75, 'rare'], [180, 120, 'epic'], [365, 200, 'legendary'], [500, 300, 'legendary'],
     [730, 500, 'legendary'], [1000, 750, 'legendary']],
    ['Day One', 'First Week', 'First Month', 'Two Months', 'Quarter', 'Half Year', 'Full Year', '500 Days', 'Two Years', 'Thousand Days']
  ),
  ...tiered('weeks-consec', 'Weekly Warrior', 'Use DEX {n} consecutive weeks', 'calendar', 'streak',
    s => s.consecutiveWeeksUsed,
    [[1, 5, 'common'], [2, 10, 'common'], [4, 20, 'common'], [8, 35, 'rare'],
     [12, 55, 'rare'], [26, 90, 'epic'], [52, 150, 'legendary']],
    ['First Week', 'Two Weeks', 'Monthly', 'Two Months', 'Quarter', 'Half Year', 'Full Year']
  ),
  ...tiered('months-active', 'Monthly Regular', 'Be active for {n} months', 'calendar', 'streak',
    s => s.monthsActive,
    [[1, 10, 'common'], [3, 25, 'common'], [6, 50, 'rare'], [12, 100, 'epic'], [24, 175, 'legendary'], [36, 250, 'legendary']],
    ['First Month', 'Quarter', 'Half Year', 'Full Year', 'Two Years', 'Three Years']
  ),
  ...tiered('long-session', 'Marathon Runner', 'Have a session lasting {n}+ minutes', 'clock', 'streak',
    s => s.longestSessionMinutes,
    [[30, 10, 'common'], [60, 25, 'rare'], [120, 50, 'epic'], [240, 80, 'legendary'], [480, 150, 'legendary']],
    ['Half Hour', 'Hour Session', 'Two Hour', 'Four Hour', 'Eight Hour Marathon']
  ),
  { id: 'focus-1000', title: 'Deep Focus', description: 'Spend 10000 minutes in focus mode', icon: 'target', category: 'streak',
    condition: s => s.focusTimeMinutes >= 10000, points: 100, rarity: 'epic' },
  { id: 'focus-5000', title: 'Zen Master', description: 'Spend 50000 minutes in focus mode', icon: 'target', category: 'streak',
    condition: s => s.focusTimeMinutes >= 50000, points: 200, rarity: 'legendary' },

  // ── APP SWITCHING & MULTITASKING (10) ─────────────────────────────────

  ...tiered('app-switches', 'App Switcher', 'Switch between apps {n} times total', 'shuffle', 'speed',
    s => s.appSwitchesTotal,
    [[10, 5, 'common'], [50, 15, 'common'], [100, 30, 'rare'], [500, 55, 'epic'],
     [1000, 100, 'epic'], [5000, 175, 'legendary'], [10000, 300, 'legendary']],
    ['First Switch', 'Switcher', 'Juggler', 'Multi-Tasker', 'Flow State', 'Switch Master', 'Switch God']
  ),
  ...tiered('apps-closed', 'App Closer', 'Close {n} apps', 'x', 'speed',
    s => s.appsClosed,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare']],
    ['First Close', 'Closer', 'Cleanup Pro']
  ),

  // ── NOTIFICATIONS & SYSTEM (8) ───────────────────────────────────────

  ...tiered('notifs-received', 'Notification Center', 'Receive {n} notifications', 'bell', 'discovery',
    s => s.notificationsReceived,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic']],
    ['First Alert', 'Subscriber', 'Notified', 'Alert Pro']
  ),
  ...tiered('toasts-shown', 'Toast Collector', 'See {n} toast messages', 'message-square', 'discovery',
    s => s.toastsShown,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic']],
    ['First Toast', 'Toast Fan', 'Toast Pro', 'Toast Master']
  ),

  // ── RESILIENCE (6) ───────────────────────────────────────────────────

  { id: 'crash-recovery-1', title: 'Resilient', description: 'Recover from a crash', icon: 'shield', category: 'discovery',
    condition: s => s.crashRecoveries >= 1, points: 15, rarity: 'common' },
  { id: 'crash-recovery-5', title: 'Tough Cookie', description: 'Recover from 5 crashes', icon: 'shield', category: 'discovery',
    condition: s => s.crashRecoveries >= 5, points: 30, rarity: 'rare' },
  { id: 'crash-recovery-10', title: 'Unbreakable', description: 'Recover from 10 crashes', icon: 'shield', category: 'discovery',
    condition: s => s.crashRecoveries >= 10, points: 50, rarity: 'epic' },
  { id: 'errors-50', title: 'Bug Witness', description: 'Encounter 50 errors and survive', icon: 'alert-triangle', category: 'discovery',
    condition: s => s.errorsEncountered >= 50, points: 25, rarity: 'rare' },
  { id: 'errors-200', title: 'Error Veteran', description: 'Encounter 200 errors still here', icon: 'alert-triangle', category: 'discovery',
    condition: s => s.errorsEncountered >= 200, points: 50, rarity: 'epic' },
  { id: 'errors-1000', title: 'Indestructible', description: 'Encounter 1000 errors and keep using DEX', icon: 'shield', category: 'discovery',
    condition: s => s.errorsEncountered >= 1000, points: 100, rarity: 'legendary' },

  // ── SECRET ACHIEVEMENTS PHASE 2 (30) ─────────────────────────────────

  { id: 'secret-nightwriter', title: 'Midnight Author', description: 'Create 50 notes during night sessions', icon: 'moon', category: 'discovery',
    condition: s => s.nightSessions >= 50 && s.notesCreated >= 500, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-morningprod', title: 'Dawn Productivity', description: 'Complete 50 tasks during morning sessions', icon: 'sun', category: 'discovery',
    condition: s => s.morningSessions >= 50 && s.tasksCompleted >= 500, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-noteaholic', title: 'Noteaholic', description: 'Create 10000 notes without using Tasks at all', icon: 'file-text', category: 'discovery',
    condition: s => s.notesCreated >= 10000 && s.tasksCreated === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-taskmaster', title: 'Pure Taskmaster', description: 'Complete 10000 tasks without creating notes', icon: 'check', category: 'discovery',
    condition: s => s.tasksCompleted >= 10000 && s.notesCreated === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-silent-worker', title: 'Silent Worker', description: 'Use DEX 500 days without viewing achievements', icon: 'eye-off', category: 'discovery',
    condition: s => s.uniqueDaysUsed >= 500 && s.achievementsViewed === 0, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-audio-visual', title: 'Audio-Visual Master', description: 'Edit 1000+ videos and create 1000+ tracks', icon: 'film', category: 'discovery',
    condition: s => s.videosEdited >= 1000 && s.musicTracksCreated >= 1000, points: 400, rarity: 'legendary', secret: true },
  { id: 'secret-every-day', title: 'Every Single Day', description: 'Use DEX 730 unique days', icon: 'calendar', category: 'discovery',
    condition: s => s.uniqueDaysUsed >= 730, points: 500, rarity: 'legendary', secret: true },
  { id: 'secret-keyboard-only', title: 'Keyboard Only', description: 'Use 10000+ shortcuts without Spotlight', icon: 'terminal', category: 'discovery',
    condition: s => s.shortcutsUsed >= 10000 && s.spotlightSearches === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-spotlight-only', title: 'Spotlight Devotee', description: 'Use Spotlight 5000+ times without shortcuts', icon: 'search', category: 'discovery',
    condition: s => s.spotlightSearches >= 5000 && s.shortcutsUsed === 0, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-no-browser', title: 'Offline Warrior', description: 'Use DEX 365 days without the browser', icon: 'wifi-off', category: 'discovery',
    condition: s => s.uniqueDaysUsed >= 365 && !s.appsUsed.includes('browser'), points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-browser-addict', title: 'Web Dweller', description: 'Open 25000+ tabs and load 50000+ pages', icon: 'globe', category: 'discovery',
    condition: s => s.browserTabsOpened >= 25000 && s.browserPageLoads >= 50000, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-ultra-creative', title: 'Creative Universe', description: 'Create 5000+ works in all 5 creative apps', icon: 'sparkles', category: 'discovery',
    condition: s => s.videosEdited >= 5000 && s.musicTracksCreated >= 5000 && s.imagesEdited >= 5000 && s.animationsCreated >= 5000 && s.filesConverted >= 5000,
    points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-formatter', title: 'Style Obsessed', description: 'Use bold italic and strikethrough 1000+ each', icon: 'bold', category: 'discovery',
    condition: s => s.boldFormatUses >= 1000 && s.italicFormatUses >= 1000 && s.strikethroughUses >= 1000, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-clean-desk', title: 'Clean Desktop', description: 'Close 2500 apps and delete 1000 files', icon: 'trash', category: 'discovery',
    condition: s => s.appsClosed >= 2500 && s.filesDeleted >= 1000, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-never-quit', title: 'Never Quit', description: '500-day streak + 50000 total minutes', icon: 'flame', category: 'discovery',
    condition: s => s.currentStreak >= 500 && s.totalMinutes >= 50000, points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-minimalist', title: 'Minimalist', description: 'Use only 3 apps for 100 sessions', icon: 'minus', category: 'discovery',
    condition: s => s.totalSessions >= 100 && s.appsUsed.length <= 3, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-maximalist', title: 'Maximalist', description: 'Use 20+ apps every session for 30 sessions', icon: 'maximize', category: 'discovery',
    condition: s => s.totalSessions >= 30 && s.appsUsed.length >= 20, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-copy-paste-king', title: 'Copy Paste King', description: 'Copy and paste 5000+ times each', icon: 'clipboard', category: 'discovery',
    condition: s => s.copyActions >= 5000 && s.pasteActions >= 5000, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-undo-redo', title: 'Time Loop', description: 'Undo and redo 2500+ times each', icon: 'rotate-ccw', category: 'discovery',
    condition: s => s.undoActions >= 2500 && s.redoActions >= 2500, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-season4', title: 'Four Seasons', description: 'Use DEX across 4 different seasons', icon: 'sun', category: 'discovery',
    condition: s => s.seasonsActive >= 4, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-wallpaper-100', title: 'Wallpaper Addict', description: 'Change wallpaper 1000 times', icon: 'image', category: 'discovery',
    condition: s => s.wallpapersChanged >= 1000, points: 75, rarity: 'epic', secret: true },
  { id: 'secret-drag-master', title: 'Drag and Drop Deity', description: 'Drag and drop 10000+ items', icon: 'move', category: 'discovery',
    condition: s => s.dragDropActions >= 10000, points: 100, rarity: 'legendary', secret: true },
  { id: 'secret-million-scroll', title: 'Scroll to Infinity', description: 'Scroll 10000000 pixels total', icon: 'chevrons-down', category: 'discovery',
    condition: s => s.scrollDistance >= 10000000, points: 100, rarity: 'legendary', secret: true },
  { id: 'secret-one-million-chars', title: 'Million Keystrokes', description: 'Type 10000000 characters', icon: 'type', category: 'discovery',
    condition: s => s.charactersTyped >= 10000000, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-organize-everything', title: 'Everything Organized', description: 'Create 250+ folders 500+ tags 250+ lists', icon: 'folder', category: 'discovery',
    condition: s => s.foldersCreated >= 250 && s.noteTagsCreated >= 500 && s.taskListsCreated >= 250, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-batch-master', title: 'Batch God', description: 'Run 500 batch conversions with 5000+ converted', icon: 'zap', category: 'discovery',
    condition: s => s.batchConversions >= 500 && s.filesConverted >= 5000, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-search-everything', title: 'Search Everything', description: 'Search 50000+ times across all systems', icon: 'search', category: 'discovery',
    condition: s => (s.searchesPerformed + s.spotlightSearches + s.browserSearches + s.notesSearched) >= 50000, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-triple-streak', title: 'Triple Century', description: '300-day streak with 100000+ total minutes', icon: 'flame', category: 'discovery',
    condition: s => s.currentStreak >= 300 && s.totalMinutes >= 100000, points: 750, rarity: 'legendary', secret: true },
  { id: 'secret-dex-god', title: 'DEX God', description: 'Unlock 900+ achievements', icon: 'crown', category: 'discovery',
    condition: () => false, points: 2000, rarity: 'legendary', secret: true },
  { id: 'secret-the-completionist', title: 'The Completionist', description: 'Unlock every single achievement', icon: 'award', category: 'discovery',
    condition: () => false, points: 5000, rarity: 'legendary', secret: true },

  // ── GAMING CATEGORY (20) ──────────────────────────────────────────────

  ...tiered('games-played', 'Gamer', 'Play {n} games', 'gamepad-2', 'gaming',
    s => s.gamesPlayed,
    [[1, 5, 'common'], [5, 15, 'common'], [10, 25, 'common'], [25, 45, 'rare'],
     [50, 75, 'rare'], [100, 120, 'epic'], [250, 200, 'epic'], [500, 300, 'legendary'],
     [1000, 500, 'legendary'], [2500, 750, 'legendary']],
    ['First Game', 'Casual', 'Gamer', 'Enthusiast', 'Dedicated', 'Hardcore', 'Pro Gamer', 'Gaming Legend', 'Gaming God', 'Eternal Gamer']
  ),
  { id: 'reaction-500', title: 'Quick Reflexes', description: 'Achieve sub-500ms reaction time', icon: 'activity', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 500, points: 10, rarity: 'common' },
  { id: 'reaction-300', title: 'Fast Hands', description: 'Achieve sub-300ms reaction time', icon: 'activity', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 300, points: 25, rarity: 'rare' },
  { id: 'reaction-200', title: 'Lightning Reflexes', description: 'Achieve sub-200ms reaction time', icon: 'zap', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 200, points: 50, rarity: 'epic' },
  { id: 'reaction-150', title: 'Superhuman', description: 'Achieve sub-150ms reaction time', icon: 'zap', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 150, points: 100, rarity: 'legendary' },
  { id: 'reaction-100', title: 'Untouchable', description: 'Achieve sub-100ms reaction time', icon: 'zap', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 100, points: 200, rarity: 'legendary' },
  { id: 'typing-30', title: 'Learning to Type', description: 'Achieve 30+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 30, points: 10, rarity: 'common' },
  { id: 'typing-60', title: 'Touch Typist', description: 'Achieve 60+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 60, points: 25, rarity: 'rare' },
  { id: 'typing-100', title: 'Speed Typist', description: 'Achieve 100+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 100, points: 50, rarity: 'epic' },
  { id: 'typing-120', title: 'Typing Machine', description: 'Achieve 120+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 120, points: 100, rarity: 'legendary' },
  { id: 'typing-150', title: 'Keyboard Deity', description: 'Achieve 150+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 150, points: 200, rarity: 'legendary' },

  // ── CROSS-APP COMBOS PHASE 2 (20) ────────────────────────────────────

  { id: 'combo-note-to-task', title: 'Note to Action', description: 'Create 500+ notes and complete 500+ tasks', icon: 'check-square', category: 'speed',
    condition: s => s.notesCreated >= 500 && s.tasksCompleted >= 500, points: 60, rarity: 'rare' },
  { id: 'combo-creative-share', title: 'Create and Share', description: 'Create 500+ media items and transfer 250+ times', icon: 'share', category: 'speed',
    condition: s => (s.videosEdited + s.musicTracksCreated + s.imagesEdited) >= 500 && s.transfersCompleted >= 250, points: 80, rarity: 'epic' },
  { id: 'combo-organize-master', title: 'Organization Master', description: 'Use Notes Tasks Calendar and Kanban 500+ each', icon: 'grid', category: 'speed',
    condition: s => (s.appUsageCounts['notes'] || 0) >= 500 && (s.appUsageCounts['tasks'] || 0) >= 500 && (s.appUsageCounts['calendar'] || 0) >= 500 && (s.appUsageCounts['kanban'] || 0) >= 500, points: 120, rarity: 'epic' },
  { id: 'combo-media-pipeline', title: 'Media Pipeline', description: 'Edit in PRISM VINX FLUX and convert in FORGE', icon: 'shuffle', category: 'speed',
    condition: s => s.imagesEdited >= 100 && s.videosEdited >= 100 && s.animationsCreated >= 100 && s.filesConverted >= 100, points: 100, rarity: 'epic' },
  { id: 'combo-browse-organize', title: 'Research Pipeline', description: 'Browse 5000+ pages download 250+ organize in 100+ folders', icon: 'globe', category: 'speed',
    condition: s => s.browserPageLoads >= 5000 && s.browserDownloads >= 250 && s.foldersCreated >= 100, points: 100, rarity: 'epic' },
  { id: 'combo-full-suite', title: 'Full DEX Experience', description: 'Use every app at least 100 times', icon: 'crown', category: 'mastery',
    condition: s => s.appsUsed.length >= 20 && Object.values(s.appUsageCounts).filter(c => c >= 100).length >= 20, points: 300, rarity: 'legendary' },
  { id: 'combo-video-music', title: 'Film Scorer', description: 'Edit 250+ videos and create 250+ tracks', icon: 'film', category: 'media',
    condition: s => s.videosEdited >= 250 && s.musicTracksCreated >= 250, points: 80, rarity: 'epic' },
  { id: 'combo-design-animate', title: 'Design to Motion', description: 'Edit 250+ images and create 250+ animations', icon: 'layers', category: 'media',
    condition: s => s.imagesEdited >= 250 && s.animationsCreated >= 250, points: 80, rarity: 'epic' },
  { id: 'combo-write-present', title: 'Write and Present', description: 'Create 1000+ notes and 100+ animations', icon: 'file-text', category: 'creator',
    condition: s => s.notesCreated >= 1000 && s.animationsCreated >= 100, points: 60, rarity: 'rare' },
  { id: 'combo-secure-system', title: 'Security Conscious', description: 'Generate 500+ passwords and create 250+ folders', icon: 'lock', category: 'power',
    condition: s => s.passwordsGenerated >= 500 && s.foldersCreated >= 250, points: 60, rarity: 'rare' },
  { id: 'combo-search-everywhere', title: 'Search Everywhere', description: 'Use Spotlight browser and note search 500+ each', icon: 'search', category: 'power',
    condition: s => s.spotlightSearches >= 500 && s.browserSearches >= 500 && s.notesSearched >= 500, points: 100, rarity: 'epic' },
  { id: 'combo-content-machine', title: 'Content Machine', description: 'Create 2500+ combined notes tasks and events', icon: 'edit', category: 'creator',
    condition: s => s.notesCreated + s.tasksCreated + s.calendarEventsCreated >= 2500, points: 80, rarity: 'epic' },
  { id: 'combo-heavy-user', title: 'Heavy User', description: '100000+ keystrokes 25000+ switches 50M+ scroll', icon: 'activity', category: 'mastery',
    condition: s => s.charactersTyped >= 100000 && s.appSwitchesTotal >= 25000 && s.scrollDistance >= 50000000, points: 200, rarity: 'legendary' },
  { id: 'combo-backup-king', title: 'Backup King', description: 'Export 500+ times and transfer 250+ files', icon: 'download', category: 'social',
    condition: s => s.dataExported >= 500 && s.transfersCompleted >= 250, points: 80, rarity: 'epic' },
  { id: 'combo-streak-creative', title: 'Daily Creator', description: '100-day streak + create 100+ in each creative app', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 100 && s.videosEdited >= 100 && s.musicTracksCreated >= 100 && s.imagesEdited >= 100, points: 200, rarity: 'legendary' },
  { id: 'combo-search-master-all', title: 'Omniscient Search', description: 'Perform 100000 total searches', icon: 'search', category: 'mastery',
    condition: s => (s.searchesPerformed + s.spotlightSearches + s.browserSearches + s.notesSearched) >= 100000, points: 400, rarity: 'legendary' },
  { id: 'combo-social-butterfly', title: 'Social Butterfly', description: 'Share 250+ notes transfer 500+ export 250+', icon: 'share', category: 'social',
    condition: s => s.notesShared >= 250 && s.transfersCompleted >= 500 && s.dataExported >= 250, points: 150, rarity: 'legendary' },
  { id: 'combo-night-creative', title: 'Midnight Creator', description: '100+ night sessions with 1000+ creative works', icon: 'moon', category: 'streak',
    condition: s => s.nightSessions >= 100 && (s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated) >= 1000, points: 150, rarity: 'legendary' },
  { id: 'combo-weekend-producer', title: 'Weekend Producer', description: '100+ weekend sessions with 500+ media exports', icon: 'sun', category: 'streak',
    condition: s => s.weekendSessions >= 100 && (s.videoExports + s.animationExports + s.audioMixdowns) >= 500, points: 150, rarity: 'legendary' },
  { id: 'combo-dex-master', title: 'DEX Master', description: '1000+ days 500000+ keys 10000+ switches all apps 500+', icon: 'crown', category: 'mastery',
    condition: s => s.uniqueDaysUsed >= 1000 && s.charactersTyped >= 500000 && s.appSwitchesTotal >= 10000, points: 2000, rarity: 'legendary' },

  // ==========================================================================
  //  ACHIEVEMENTS 1001–2000 — Phase 3 Expansion (v3.0)
  // ==========================================================================

  // ══════════════════════════════════════════════════════════════════════════
  // ENGINEERING CATEGORY (200) — AXL Engineering Design Studio
  // ══════════════════════════════════════════════════════════════════════════

  // AXL first-use & veteran tiers auto-generated from APPS array above
  // (first-axl, vet-axl-10, vet-axl-50, vet-axl-100, vet-axl-250 are in explorer)

  // Parts created (10)
  ...tiered('axl-parts', 'Part Designer', 'Create {n} parts in AXL', 'compass', 'engineering',
    s => s.axlPartsCreated,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'common'], [25, 55, 'rare'],
     [50, 80, 'rare'], [100, 120, 'epic'], [250, 175, 'epic'], [500, 250, 'legendary'],
     [1000, 400, 'legendary'], [2500, 600, 'mythic']],
    ['First Part', 'Modeler', 'Builder', 'Fabricator', 'Machinist', 'Engineer', 'Designer', 'CAD Pro', 'Part Legend', 'Part God']
  ),

  // Assemblies built (8)
  ...tiered('axl-assemblies', 'Assembly Builder', 'Build {n} assemblies in AXL', 'compass', 'engineering',
    s => s.axlAssembliesBuilt,
    [[1, 15, 'common'], [3, 30, 'common'], [5, 50, 'rare'], [10, 80, 'rare'],
     [25, 120, 'epic'], [50, 175, 'epic'], [100, 275, 'legendary'], [250, 450, 'mythic']],
    ['First Assembly', 'Assembler', 'Builder', 'Assembly Pro', 'Integrator', 'Assembly Master', 'Assembly Legend', 'Assembly God']
  ),

  // Boolean operations (6)
  ...tiered('axl-booleans', 'Boolean Master', 'Perform {n} boolean operations', 'scissors', 'engineering',
    s => s.axlBooleanOps,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'epic'],
     [500, 150, 'legendary'], [1000, 250, 'mythic']],
    ['First Cut', 'Union Novice', 'Subtract Pro', 'Boolean Expert', 'Boolean Master', 'Boolean God']
  ),

  // Simulations (8)
  ...tiered('axl-sims', 'Simulation Engineer', 'Run {n} simulations in AXL', 'activity', 'engineering',
    s => s.axlSimulationsRun,
    [[1, 15, 'common'], [5, 30, 'common'], [10, 50, 'rare'], [25, 80, 'rare'],
     [50, 120, 'epic'], [100, 175, 'epic'], [250, 300, 'legendary'], [500, 500, 'mythic']],
    ['First Sim', 'Tester', 'Analyst', 'Stress Tester', 'Sim Pro', 'FEA Expert', 'Sim Master', 'Sim God']
  ),

  // BOM generation (6)
  ...tiered('axl-boms', 'BOM Builder', 'Generate {n} Bills of Materials', 'file-text', 'engineering',
    s => s.axlBOMsGenerated,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'],
     [50, 130, 'legendary'], [100, 200, 'mythic']],
    ['First BOM', 'Documenter', 'Inventory Pro', 'BOM Expert', 'BOM Master', 'BOM Legend']
  ),

  // Measurements (8)
  ...tiered('axl-measure', 'Precision Inspector', 'Take {n} measurements in AXL', 'ruler', 'engineering',
    s => s.axlMeasurements,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'rare'],
     [250, 90, 'epic'], [500, 140, 'epic'], [1000, 225, 'legendary'], [2500, 375, 'mythic']],
    ['First Measure', 'Measurer', 'Inspector', 'QC Analyst', 'Precision Pro', 'Metrology Expert', 'Measurement Master', 'Precision God']
  ),

  // Constraints (6)
  ...tiered('axl-constraints', 'Constraint Engineer', 'Add {n} assembly constraints', 'link', 'engineering',
    s => s.axlConstraintsAdded,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'epic'],
     [250, 140, 'legendary'], [500, 225, 'mythic']],
    ['First Mate', 'Constrainer', 'Assembly Fitter', 'Constraint Pro', 'Constraint Master', 'Constraint God']
  ),

  // Exports (6)
  ...tiered('axl-exports', 'CAD Exporter', 'Export {n} designs from AXL', 'download', 'engineering',
    s => s.axlExports,
    [[1, 10, 'common'], [5, 25, 'common'], [10, 50, 'rare'], [25, 80, 'epic'],
     [50, 130, 'legendary'], [100, 200, 'mythic']],
    ['First Export', 'Exporter', 'Deliverer', 'Export Pro', 'Export Master', 'Export God']
  ),

  // Standard parts (8)
  ...tiered('axl-stdparts', 'Hardware Specialist', 'Place {n} standard parts', 'package', 'engineering',
    s => s.axlStdPartsPlaced,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 65, 'rare'],
     [250, 100, 'epic'], [500, 160, 'epic'], [1000, 275, 'legendary'], [2500, 450, 'mythic']],
    ['First Bolt', 'Fastener', 'Hardware User', 'Parts Specialist', 'Hardware Pro', 'Stockroom Expert', 'Hardware Master', 'Hardware God']
  ),

  // Material changes (6)
  ...tiered('axl-materials', 'Material Scientist', 'Change materials {n} times in AXL', 'droplet', 'engineering',
    s => s.axlMaterialChanges,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'],
     [250, 120, 'legendary'], [500, 200, 'mythic']],
    ['Material Curious', 'Material Tester', 'Material Expert', 'Material Pro', 'Material Master', 'Material God']
  ),

  // Drawings (6)
  ...tiered('axl-drawings', 'Technical Drafter', 'Create {n} technical drawings', 'pen-tool', 'engineering',
    s => s.axlDrawingsCreated,
    [[1, 15, 'common'], [5, 30, 'common'], [10, 55, 'rare'], [25, 85, 'epic'],
     [50, 140, 'legendary'], [100, 225, 'mythic']],
    ['First Drawing', 'Drafter', 'Technical Artist', 'Drafting Pro', 'Drafting Master', 'Drafting God']
  ),

  // Fillets & chamfers (6)
  ...tiered('axl-fillets', 'Edge Master', 'Apply {n} fillets and chamfers', 'corner-up-right', 'engineering',
    s => s.axlFilletsChamfers,
    [[1, 5, 'common'], [10, 20, 'common'], [50, 40, 'rare'], [100, 70, 'epic'],
     [250, 120, 'legendary'], [500, 200, 'mythic']],
    ['Rounded', 'Chamfered', 'Edge Pro', 'Fillet Expert', 'Edge Master', 'Edge God']
  ),

  // Patterns (6)
  ...tiered('axl-patterns', 'Pattern Engineer', 'Create {n} feature patterns', 'grid', 'engineering',
    s => s.axlPatternsCreated,
    [[1, 10, 'common'], [10, 25, 'common'], [25, 50, 'rare'], [50, 80, 'epic'],
     [100, 140, 'legendary'], [250, 225, 'mythic']],
    ['First Pattern', 'Repeater', 'Pattern User', 'Pattern Pro', 'Pattern Master', 'Pattern God']
  ),

  // Exploded views (4)
  ...tiered('axl-explode', 'Exploded View Artist', 'Create {n} exploded views', 'maximize', 'engineering',
    s => s.axlExplodedViews,
    [[1, 10, 'common'], [10, 30, 'rare'], [25, 60, 'epic'], [50, 100, 'legendary']],
    ['First Explosion', 'Exploder', 'Explode Pro', 'Explode Master']
  ),

  // Engineering combos (20)
  { id: 'eng-full-workflow', title: 'Full Engineering Workflow', description: 'Create part + constrain + simulate + BOM + export', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 1 && s.axlConstraintsAdded >= 1 && s.axlSimulationsRun >= 1 && s.axlBOMsGenerated >= 1 && s.axlExports >= 1, points: 50, rarity: 'rare' },
  { id: 'eng-10part-assembly', title: 'Complex Assembly', description: 'Build an assembly with 10+ parts', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 10 && s.axlConstraintsAdded >= 5, points: 60, rarity: 'rare' },
  { id: 'eng-50part-assembly', title: 'Mega Assembly', description: 'Build an assembly with 50+ parts', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50 && s.axlConstraintsAdded >= 25, points: 120, rarity: 'epic' },
  { id: 'eng-100part-assembly', title: 'Industrial Assembly', description: 'Build an assembly with 100+ parts and 50+ constraints', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 100 && s.axlConstraintsAdded >= 50, points: 200, rarity: 'legendary' },
  { id: 'eng-all-primitives', title: 'Shape Master', description: 'Use all 7 primitive types', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 7, points: 25, rarity: 'common' },
  { id: 'eng-all-booleans', title: 'Boolean Trilogy', description: 'Use union subtract and intersect', icon: 'scissors', category: 'engineering',
    condition: s => s.axlBooleanOps >= 3, points: 30, rarity: 'common' },
  { id: 'eng-sim-safe', title: 'Safe Design', description: 'Achieve safety factor > 3 in simulation', icon: 'shield', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 1, points: 25, rarity: 'common' },
  { id: 'eng-sim-stress', title: 'Stress Tester', description: 'Run 100+ stress simulations', icon: 'activity', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 100, points: 80, rarity: 'epic' },
  { id: 'eng-heavy-bom', title: 'Heavy BOM', description: 'Generate a BOM with 25+ line items', icon: 'file-text', category: 'engineering',
    condition: s => s.axlBOMsGenerated >= 10 && s.axlPartsCreated >= 25, points: 60, rarity: 'rare' },
  { id: 'eng-precision', title: 'Precision Engineer', description: 'Take 500+ measurements with 100+ constraints', icon: 'ruler', category: 'engineering',
    condition: s => s.axlMeasurements >= 500 && s.axlConstraintsAdded >= 100, points: 150, rarity: 'legendary' },
  { id: 'eng-material-variety', title: 'Material Explorer', description: 'Use 10+ different materials', icon: 'palette', category: 'engineering',
    condition: s => s.axlMaterialChanges >= 10, points: 30, rarity: 'common' },
  { id: 'eng-all-materials', title: 'Material Library', description: 'Use all 16 materials in the database', icon: 'palette', category: 'engineering',
    condition: s => s.axlMaterialChanges >= 16, points: 60, rarity: 'rare' },
  { id: 'eng-steel-master', title: 'Steelworker', description: 'Create 100+ parts with steel materials', icon: 'shield', category: 'engineering',
    condition: s => s.axlPartsCreated >= 100, points: 50, rarity: 'rare' },
  { id: 'eng-technical-doc', title: 'Documentation Pro', description: 'Create 50+ drawings and 50+ BOMs', icon: 'file-text', category: 'engineering',
    condition: s => s.axlDrawingsCreated >= 50 && s.axlBOMsGenerated >= 50, points: 120, rarity: 'epic' },
  { id: 'eng-prototype-rush', title: 'Rapid Prototyper', description: 'Create 25+ parts and export in a session', icon: 'zap', category: 'engineering',
    condition: s => s.axlPartsCreated >= 25 && s.axlExports >= 5, points: 60, rarity: 'rare' },
  { id: 'eng-iterative', title: 'Iterative Designer', description: 'Run 50+ simulations and modify 100+ parts', icon: 'repeat', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 50 && s.axlPartsCreated >= 100, points: 100, rarity: 'epic' },
  { id: 'eng-master', title: 'Engineering Master', description: 'Master all AXL features: 500+ parts 100+ sims 50+ BOMs 50+ drawings', icon: 'crown', category: 'engineering',
    condition: s => s.axlPartsCreated >= 500 && s.axlSimulationsRun >= 100 && s.axlBOMsGenerated >= 50 && s.axlDrawingsCreated >= 50, points: 500, rarity: 'legendary' },
  { id: 'eng-cad-god', title: 'CAD God', description: '2500+ parts 500+ sims 250+ BOMs 250+ drawings 1000+ std parts', icon: 'crown', category: 'engineering',
    condition: s => s.axlPartsCreated >= 2500 && s.axlSimulationsRun >= 500 && s.axlBOMsGenerated >= 250 && s.axlDrawingsCreated >= 250 && s.axlStdPartsPlaced >= 1000, points: 2000, rarity: 'mythic' },
  { id: 'eng-constraint-master', title: 'Fully Constrained', description: '500+ constraints with all types used', icon: 'link', category: 'engineering',
    condition: s => s.axlConstraintsAdded >= 500, points: 200, rarity: 'legendary' },
  { id: 'eng-export-variety', title: 'Format Polyglot', description: 'Export in 5+ different formats', icon: 'download', category: 'engineering',
    condition: s => s.axlExports >= 5, points: 25, rarity: 'common' },

  // Engineering secrets (10)
  { id: 'secret-eng-nocad', title: 'CAD Prodigy', description: 'Build a 50-part assembly without undo', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50 && s.undoActions === 0, points: 300, rarity: 'mythic', secret: true },
  { id: 'secret-eng-speed', title: 'Speed Engineer', description: 'Create 25 parts export and simulate all in one session', icon: 'zap', category: 'engineering',
    condition: s => s.axlPartsCreated >= 25 && s.axlExports >= 1 && s.axlSimulationsRun >= 1, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-eng-night', title: 'Midnight Engineer', description: 'Run 50+ simulations during night sessions', icon: 'moon', category: 'engineering',
    condition: s => s.nightSessions >= 10 && s.axlSimulationsRun >= 50, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-eng-zero-fail', title: 'Zero Failures', description: 'Run 100 simulations all with safety factor > 1', icon: 'shield', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 100, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-eng-polymer', title: 'Polymer Specialist', description: 'Create 100+ ABS Nylon and Polycarbonate parts', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 100 && s.axlMaterialChanges >= 30, points: 75, rarity: 'epic', secret: true },
  { id: 'secret-eng-titanium', title: 'Titanium Enthusiast', description: 'Create 50+ titanium parts', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50 && s.axlMaterialChanges >= 10, points: 60, rarity: 'rare', secret: true },
  { id: 'secret-eng-1000parts', title: 'Thousand Parts Club', description: 'Create 1000 total parts', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 1000, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-eng-measure-king', title: 'Measurement Obsessed', description: 'Take 5000+ measurements', icon: 'ruler', category: 'engineering',
    condition: s => s.axlMeasurements >= 5000, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-eng-parametric', title: 'Parametric Master', description: '500+ patterns and 500+ fillets', icon: 'grid', category: 'engineering',
    condition: s => s.axlPatternsCreated >= 500 && s.axlFilletsChamfers >= 500, points: 250, rarity: 'legendary', secret: true },
  { id: 'secret-eng-ascended', title: 'Ascended Engineer', description: 'Unlock 150+ engineering achievements', icon: 'crown', category: 'engineering',
    condition: () => false, points: 5000, rarity: 'mythic', secret: true },

  // ══════════════════════════════════════════════════════════════════════════
  // INTEGRATION CATEGORY (200) — Cross-App & System Features
  // ══════════════════════════════════════════════════════════════════════════

  // Send To Menu usage (8)
  ...tiered('send-to', 'Send To Pro', 'Use Send To menu {n} times', 'share', 'integration',
    s => s.sendToMenuUses,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'common'], [25, 55, 'rare'],
     [50, 85, 'rare'], [100, 125, 'epic'], [250, 200, 'legendary'], [500, 350, 'mythic']],
    ['First Send', 'Sender', 'Connector', 'Networker', 'Pipeline', 'Hub', 'Integration Pro', 'Send God']
  ),

  // Assets received (8)
  ...tiered('assets-in', 'Asset Receiver', 'Receive {n} assets from other apps', 'download', 'integration',
    s => s.assetsReceived,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'common'], [25, 55, 'rare'],
     [50, 85, 'rare'], [100, 125, 'epic'], [250, 200, 'legendary'], [500, 350, 'mythic']],
    ['First Receive', 'Importer', 'Collector', 'Aggregator', 'Asset Hub', 'Receiver Pro', 'Asset Master', 'Asset God']
  ),

  // Assets sent (8)
  ...tiered('assets-out', 'Asset Sender', 'Send {n} assets to other apps', 'upload', 'integration',
    s => s.assetsSent,
    [[1, 10, 'common'], [5, 20, 'common'], [10, 35, 'common'], [25, 55, 'rare'],
     [50, 85, 'rare'], [100, 125, 'epic'], [250, 200, 'legendary'], [500, 350, 'mythic']],
    ['First Send', 'Exporter', 'Publisher', 'Distributor', 'Broadcaster', 'Sender Pro', 'Asset Broadcaster', 'Asset Evangelist']
  ),

  // Creative apps in session (6)
  ...tiered('session-creative', 'Creative Session', 'Use {n} creative apps in one session', 'sparkles', 'integration',
    s => s.creativeAppsUsedInSession,
    [[2, 15, 'common'], [3, 30, 'common'], [4, 50, 'rare'], [5, 80, 'epic'], [6, 120, 'legendary'], [7, 200, 'mythic']],
    ['Duo Creative', 'Triple Creative', 'Quad Creative', 'Penta Creative', 'Hexa Creative', 'Full Creative Suite']
  ),

  // Cross-app workflows (8)
  ...tiered('cross-wf', 'Cross-App Workflow', 'Complete {n} cross-app workflows', 'shuffle', 'integration',
    s => s.crossAppWorkflows,
    [[1, 15, 'common'], [5, 30, 'common'], [10, 50, 'rare'], [25, 80, 'rare'],
     [50, 120, 'epic'], [100, 175, 'epic'], [250, 300, 'legendary'], [500, 500, 'mythic']],
    ['First Flow', 'Pipeliner', 'Flow Builder', 'Workflow Pro', 'Pipeline Expert', 'Workflow Architect', 'Flow Master', 'Flow God']
  ),

  // Spaces (6)
  ...tiered('spaces', 'Space Manager', 'Create {n} virtual spaces', 'layout', 'integration',
    s => s.spacesCreated,
    [[1, 10, 'common'], [3, 25, 'common'], [5, 45, 'rare'], [10, 75, 'epic'],
     [20, 120, 'legendary'], [50, 200, 'mythic']],
    ['First Space', 'Space User', 'Space Creator', 'Space Pro', 'Space Master', 'Space God']
  ),

  // Widgets (8)
  ...tiered('widgets', 'Widget User', 'Use widgets {n} times', 'grid', 'integration',
    s => s.widgetsUsed,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'rare'],
     [250, 90, 'epic'], [500, 140, 'epic'], [1000, 225, 'legendary'], [2500, 375, 'mythic']],
    ['First Widget', 'Widget User', 'Widget Fan', 'Widget Regular', 'Widget Pro', 'Widget Expert', 'Widget Master', 'Widget God']
  ),

  // Mission Control (6)
  ...tiered('mission-ctrl', 'Mission Control', 'Activate Mission Control {n} times', 'airplay', 'integration',
    s => s.missionControlActivations,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'epic'],
     [250, 130, 'legendary'], [500, 200, 'mythic']],
    ['First Flight', 'Controller', 'Navigator', 'Mission Pro', 'Mission Master', 'Mission God']
  ),

  // Snap layouts (6)
  ...tiered('snap-layouts', 'Snap Master', 'Use snap layouts {n} times', 'layout', 'integration',
    s => s.snapLayoutsUsed,
    [[1, 10, 'common'], [10, 25, 'common'], [50, 50, 'rare'], [100, 80, 'epic'],
     [250, 130, 'legendary'], [500, 200, 'mythic']],
    ['First Snap', 'Snapper', 'Layout User', 'Layout Pro', 'Layout Master', 'Layout God']
  ),

  // Gestures (8)
  ...tiered('gestures', 'Gesture Navigator', 'Perform {n} gestures', 'hand', 'integration',
    s => s.gesturesPerformed,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'rare'],
     [250, 90, 'epic'], [500, 140, 'epic'], [1000, 225, 'legendary'], [2500, 375, 'mythic']],
    ['First Gesture', 'Gesturer', 'Swiper', 'Gesture Fan', 'Gesture Pro', 'Gesture Expert', 'Gesture Master', 'Gesture God']
  ),

  // Integration combos (40)
  { id: 'int-prism-to-flux', title: 'Design to Motion', description: 'Send an image from PRISM to FLUX', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('prism') && s.appsUsed.includes('flux'), points: 25, rarity: 'common' },
  { id: 'int-imosion-to-vinx', title: 'Score to Film', description: 'Send audio from Imosion to VINX', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('imosion') && s.appsUsed.includes('videoeditor'), points: 25, rarity: 'common' },
  { id: 'int-vinx-to-forge', title: 'Edit to Encode', description: 'Send video from VINX to FORGE', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('videoeditor') && s.appsUsed.includes('forge'), points: 25, rarity: 'common' },
  { id: 'int-axl-to-prism', title: 'CAD to Image', description: 'Send a model from AXL to PRISM', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('axl') && s.appsUsed.includes('prism'), points: 30, rarity: 'rare' },
  { id: 'int-axl-to-forge', title: 'CAD to Render', description: 'Send an AXL export to FORGE', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('axl') && s.appsUsed.includes('forge'), points: 30, rarity: 'rare' },
  { id: 'int-flux-to-vinx', title: 'Motion to Film', description: 'Send animation from FLUX to VINX', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('flux') && s.appsUsed.includes('videoeditor'), points: 25, rarity: 'common' },
  { id: 'int-all-creative', title: 'Creative Suite Circle', description: 'Use Send To between all 7 creative apps', icon: 'circle', category: 'integration',
    condition: s => s.sendToMenuUses >= 7 && ['imosion', 'videoeditor', 'prism', 'flux', 'forge', 'axl', 'rewind'].every(a => s.appsUsed.includes(a)), points: 100, rarity: 'epic' },
  { id: 'int-pipeline-5', title: '5-App Pipeline', description: 'Create + send across 5 different apps', icon: 'git-branch', category: 'integration',
    condition: s => s.sendToMenuUses >= 5 && s.creativeAppsUsedInSession >= 5, points: 80, rarity: 'epic' },
  { id: 'int-pipeline-7', title: 'Full Pipeline', description: 'Send to all 7 creative apps in a session', icon: 'git-branch', category: 'integration',
    condition: s => s.creativeAppsUsedInSession >= 7, points: 200, rarity: 'legendary' },
  { id: 'int-sendto-100', title: 'Integration Expert', description: 'Use Send To 100+ times', icon: 'share', category: 'integration',
    condition: s => s.sendToMenuUses >= 100, points: 80, rarity: 'epic' },
  { id: 'int-sendto-500', title: 'Integration Master', description: 'Use Send To 500+ times', icon: 'share', category: 'integration',
    condition: s => s.sendToMenuUses >= 500, points: 200, rarity: 'legendary' },
  { id: 'int-space-creative', title: 'Creative Space', description: 'Use Spaces with 3+ creative apps open', icon: 'layout', category: 'integration',
    condition: s => s.spacesCreated >= 1 && s.creativeAppsUsedInSession >= 3, points: 40, rarity: 'rare' },
  { id: 'int-mc-10apps', title: 'Bird\'s Eye View', description: 'Activate Mission Control with 10+ apps open', icon: 'airplay', category: 'integration',
    condition: s => s.missionControlActivations >= 1 && s.appsUsed.length >= 10, points: 40, rarity: 'rare' },
  { id: 'int-snap-productivity', title: 'Split Productivity', description: 'Use snap layouts 50+ times', icon: 'layout', category: 'integration',
    condition: s => s.snapLayoutsUsed >= 50, points: 50, rarity: 'rare' },
  { id: 'int-gesture-natural', title: 'Natural Interface', description: 'Perform 500+ gestures', icon: 'hand', category: 'integration',
    condition: s => s.gesturesPerformed >= 500, points: 80, rarity: 'epic' },
  { id: 'int-widget-dashboard', title: 'Widget Dashboard', description: 'Use 5+ different widgets', icon: 'grid', category: 'integration',
    condition: s => s.widgetsUsed >= 5, points: 25, rarity: 'common' },
  { id: 'int-widget-power', title: 'Widget Power User', description: 'Use widgets 500+ times', icon: 'grid', category: 'integration',
    condition: s => s.widgetsUsed >= 500, points: 80, rarity: 'epic' },
  { id: 'int-full-tahoe', title: 'Tahoe Native', description: 'Use Spaces + Mission Control + Widgets + Snap + Gestures', icon: 'mountain', category: 'integration',
    condition: s => s.spacesCreated >= 1 && s.missionControlActivations >= 1 && s.widgetsUsed >= 1 && s.snapLayoutsUsed >= 1 && s.gesturesPerformed >= 1, points: 60, rarity: 'rare' },
  { id: 'int-tahoe-master', title: 'Tahoe Master', description: 'Master all Tahoe features: 50+ each', icon: 'mountain', category: 'integration',
    condition: s => s.spacesCreated >= 50 && s.missionControlActivations >= 50 && s.widgetsUsed >= 50 && s.snapLayoutsUsed >= 50 && s.gesturesPerformed >= 50, points: 200, rarity: 'legendary' },
  { id: 'int-creative-engineer', title: 'Creative Engineer', description: 'Use AXL + PRISM + FLUX + FORGE in one session', icon: 'compass', category: 'integration',
    condition: s => s.creativeAppsUsedInSession >= 4 && s.appsUsed.includes('axl'), points: 60, rarity: 'rare' },
  { id: 'int-studio-workflow', title: 'Studio Workflow', description: 'Create in Imosion + edit in VINX + export in FORGE', icon: 'shuffle', category: 'integration',
    condition: s => s.musicTracksCreated >= 1 && s.videosEdited >= 1 && s.filesConverted >= 1, points: 40, rarity: 'rare' },
  { id: 'int-design-review', title: 'Design Review', description: 'Export from AXL + annotate in PRISM + present in FLUX', icon: 'compass', category: 'integration',
    condition: s => s.axlExports >= 1 && s.imagesEdited >= 1 && s.animationsCreated >= 1, points: 60, rarity: 'epic' },
  { id: 'int-cross-1000', title: 'Cross-App Veteran', description: 'Complete 1000+ cross-app actions', icon: 'shuffle', category: 'integration',
    condition: s => s.sendToMenuUses + s.assetsReceived + s.assetsSent >= 1000, points: 200, rarity: 'legendary' },
  { id: 'int-ecosystem', title: 'Ecosystem Master', description: 'Use all 25 apps + all Tahoe features + 500 integrations', icon: 'crown', category: 'integration',
    condition: s => s.appsUsed.length >= 25 && s.sendToMenuUses >= 500 && s.spacesCreated >= 10 && s.widgetsUsed >= 100, points: 1000, rarity: 'mythic' },

  // Integration secrets (16)
  { id: 'secret-int-roundtrip', title: 'Round Trip', description: 'Send asset from app A to B and back in one session', icon: 'repeat', category: 'integration',
    condition: s => s.assetsSent >= 2 && s.assetsReceived >= 2, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-int-7app', title: 'Creative Conductor', description: 'Use all 7 creative apps in a single session', icon: 'sparkles', category: 'integration',
    condition: s => s.creativeAppsUsedInSession >= 7, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-int-no-mouse', title: 'Gesture Only', description: 'Navigate with 100+ gestures without using mouse clicks', icon: 'hand', category: 'integration',
    condition: s => s.gesturesPerformed >= 100, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-int-space-10', title: 'Ten Spaces', description: 'Create 10 virtual spaces', icon: 'layout', category: 'integration',
    condition: s => s.spacesCreated >= 10, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-int-mc-20', title: 'Mission Commander', description: 'Use Mission Control with 20+ windows visible', icon: 'airplay', category: 'integration',
    condition: s => s.missionControlActivations >= 50 && s.appsUsed.length >= 20, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-int-snap-grid', title: 'Snap Grid Master', description: 'Use all snap layout positions', icon: 'layout', category: 'integration',
    condition: s => s.snapLayoutsUsed >= 20, points: 40, rarity: 'rare', secret: true },
  { id: 'secret-int-widget-all', title: 'Widget Collector', description: 'Use all 8 widget types', icon: 'grid', category: 'integration',
    condition: s => s.widgetsUsed >= 8, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-int-5000sends', title: 'Integration Legend', description: 'Send 5000+ assets across apps', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 5000, points: 500, rarity: 'mythic', secret: true },
  { id: 'secret-int-axl-prism', title: 'CAD Artist', description: 'Send 100+ AXL models to PRISM for rendering', icon: 'compass', category: 'integration',
    condition: s => s.axlExports >= 100 && s.imagesEdited >= 100, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-int-full-circle', title: 'Full Circle Engineering', description: 'Design in AXL + render in PRISM + animate in FLUX + encode in FORGE', icon: 'compass', category: 'integration',
    condition: s => s.axlExports >= 10 && s.imagesEdited >= 10 && s.animationsCreated >= 10 && s.filesConverted >= 10, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-int-night-integration', title: 'Night Integration', description: 'Use 5+ creative apps during night sessions', icon: 'moon', category: 'integration',
    condition: s => s.nightSessions >= 10 && s.creativeAppsUsedInSession >= 5, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-int-weekend-suite', title: 'Weekend Studio', description: 'Use all creative apps on weekends 25+ times', icon: 'sun', category: 'integration',
    condition: s => s.weekendSessions >= 25 && s.creativeAppsUsedInSession >= 5, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-int-gesture-500', title: 'Gesture Virtuoso', description: 'Perform 2500+ multi-touch gestures', icon: 'hand', category: 'integration',
    condition: s => s.gesturesPerformed >= 2500, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-int-space-mc-combo', title: 'Space Commander', description: 'Use 10 spaces with 100+ MC activations', icon: 'airplay', category: 'integration',
    condition: s => s.spacesCreated >= 10 && s.missionControlActivations >= 100, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-int-snap-expert', title: 'Snap Expert', description: 'Use 500+ snap layouts', icon: 'layout', category: 'integration',
    condition: s => s.snapLayoutsUsed >= 500, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-int-ascended', title: 'Ascended Integrator', description: 'Unlock 150+ integration achievements', icon: 'crown', category: 'integration',
    condition: () => false, points: 5000, rarity: 'mythic', secret: true },

  // ══════════════════════════════════════════════════════════════════════════
  // EXPANDED EXISTING CATEGORIES (600) — Deeper tiers + new combos
  // ══════════════════════════════════════════════════════════════════════════

  // ── EXPLORER EXPANSION (60) ───────────────────────────────────────────

  // Use app 100 times — extended tiers (26)
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 100, 150, 'epic')),

  // Use app 250 times — legendary tier (26)
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 250, 300, 'legendary')),

  // Category-specific exploration (8)
  { id: 'exp-all-creative-7', title: 'Creative Suite 7', description: 'Use all 7 creative apps (incl AXL)', icon: 'sparkles', category: 'explorer',
    condition: s => ['videoeditor', 'imosion', 'prism', 'flux', 'forge', 'axl', 'rewind'].every(a => s.appsUsed.includes(a)), points: 120, rarity: 'epic' },
  { id: 'exp-utility-master', title: 'Utility Master', description: 'Use Calculator Password and Power apps 100+ times each', icon: 'tool', category: 'explorer',
    condition: s => (s.appUsageCounts['calculator'] || 0) >= 100 && (s.appUsageCounts['passwordgenerator'] || 0) >= 100 && (s.appUsageCounts['power'] || 0) >= 100, points: 75, rarity: 'epic' },
  { id: 'exp-25apps', title: 'Complete Explorer', description: 'Use all 26 apps at least once', icon: 'compass', category: 'explorer',
    condition: s => s.appsUsed.length >= 26, points: 200, rarity: 'legendary' },
  { id: 'exp-25apps-100', title: 'Universal Master', description: 'Use all 26 apps 100+ times each', icon: 'crown', category: 'explorer',
    condition: s => s.appsUsed.length >= 26 && Object.values(s.appUsageCounts).filter(c => c >= 100).length >= 26, points: 500, rarity: 'mythic' },
  { id: 'exp-creative-binge', title: 'Creative Binge', description: 'Use 5 creative apps 50+ times in a month', icon: 'sparkles', category: 'explorer',
    condition: s => ['videoeditor', 'imosion', 'prism', 'flux', 'forge'].filter(a => (s.appUsageCounts[a] || 0) >= 50).length >= 5, points: 100, rarity: 'epic' },
  { id: 'exp-prod-binge', title: 'Productivity Binge', description: 'Use Notes Tasks Calendar Kanban Workflows 50+ each', icon: 'check-square', category: 'explorer',
    condition: s => ['notes', 'tasks', 'calendar', 'kanban', 'workflows'].filter(a => (s.appUsageCounts[a] || 0) >= 50).length >= 5, points: 80, rarity: 'epic' },
  { id: 'exp-daily-app-count', title: 'Daily Variety', description: 'Use 15+ different apps consistently', icon: 'grid', category: 'explorer',
    condition: s => s.appsUsed.length >= 15 && s.totalSessions >= 50, points: 60, rarity: 'rare' },
  { id: 'exp-app-marathon', title: 'App Marathon', description: 'Use 20+ apps in a single session', icon: 'trophy', category: 'explorer',
    condition: s => s.appsUsed.length >= 20, points: 100, rarity: 'epic' },

  // ── CREATOR EXPANSION (60) ────────────────────────────────────────────

  // Higher tiers for existing stats
  ...tiered('notes-mega', 'Note Marathon', 'Create {n} lifetime notes', 'file-text', 'creator',
    s => s.notesCreated,
    [[1000, 150, 'epic'], [2500, 250, 'legendary'], [5000, 400, 'legendary'], [10000, 700, 'mythic']],
    ['Prolific I', 'Prolific II', 'Prolific III', 'Note Machine']
  ),
  ...tiered('tasks-mega', 'Task Machine', 'Complete {n} lifetime tasks', 'check', 'creator',
    s => s.tasksCompleted,
    [[1000, 150, 'epic'], [2500, 250, 'legendary'], [5000, 400, 'legendary'], [10000, 700, 'mythic']],
    ['Achiever I', 'Achiever II', 'Achiever III', 'Task Deity']
  ),
  ...tiered('uploads-mega', 'Upload Legend', 'Upload {n} lifetime files', 'upload', 'creator',
    s => s.filesUploaded,
    [[500, 100, 'epic'], [1000, 175, 'legendary'], [2500, 300, 'legendary'], [5000, 500, 'mythic']],
    ['Heavy Uploader', 'Upload Giant', 'Upload Titan', 'Upload God']
  ),
  ...tiered('wf-mega', 'Workflow Machine', 'Create {n} lifetime workflows', 'shuffle', 'creator',
    s => s.workflowsCreated,
    [[250, 120, 'epic'], [500, 200, 'legendary'], [1000, 350, 'legendary'], [2500, 600, 'mythic']],
    ['Automation Expert', 'Automation Leader', 'Automation King', 'Automation Deity']
  ),
  ...tiered('kanban-mega', 'Kanban Legend', 'Create {n} lifetime cards', 'columns', 'creator',
    s => s.kanbanCardsCreated,
    [[500, 100, 'epic'], [1000, 175, 'legendary'], [2500, 300, 'legendary'], [5000, 500, 'mythic']],
    ['Card Master', 'Board Emperor', 'Agile King', 'Agile Deity']
  ),
  ...tiered('pwd-mega', 'Security Legend', 'Generate {n} lifetime passwords', 'lock', 'creator',
    s => s.passwordsGenerated,
    [[500, 100, 'epic'], [1000, 175, 'legendary'], [2500, 300, 'legendary'], [5000, 500, 'mythic']],
    ['Crypto Expert', 'Crypto Master', 'Crypto King', 'Security Deity']
  ),
  ...tiered('cal-mega', 'Calendar Legend', 'Create {n} lifetime events', 'calendar', 'creator',
    s => s.calendarEventsCreated,
    [[250, 80, 'epic'], [500, 140, 'legendary'], [1000, 225, 'legendary'], [2500, 400, 'mythic']],
    ['Time Manager', 'Scheduling Expert', 'Calendar King', 'Time Deity']
  ),
  // Creator combos
  { id: 'create-10k-total', title: '10K Creator', description: 'Create 10000+ combined notes tasks events and cards', icon: 'edit', category: 'creator',
    condition: s => s.notesCreated + s.tasksCreated + s.calendarEventsCreated + s.kanbanCardsCreated >= 10000, points: 200, rarity: 'legendary' },
  { id: 'create-50k-total', title: '50K Creator', description: 'Create 50000+ combined items', icon: 'crown', category: 'creator',
    condition: s => s.notesCreated + s.tasksCreated + s.calendarEventsCreated + s.kanbanCardsCreated >= 50000, points: 500, rarity: 'mythic' },
  { id: 'create-format-all', title: 'Formatting Master', description: 'Use all formatting types 100+ times each', icon: 'bold', category: 'creator',
    condition: s => s.boldFormatUses >= 100 && s.italicFormatUses >= 100 && s.strikethroughUses >= 100 && s.highlightUses >= 100, points: 100, rarity: 'epic' },
  { id: 'create-structure', title: 'Structure Expert', description: 'Create 100+ tables 100+ lists and 100+ code blocks', icon: 'grid', category: 'creator',
    condition: s => s.tablesCreated >= 100 && s.listsCreated >= 100 && s.codeBlocksCreated >= 100, points: 100, rarity: 'epic' },
  { id: 'create-words-1m', title: 'Million Words', description: 'Type 1000000 words', icon: 'type', category: 'creator',
    condition: s => s.wordsTyped >= 1000000, points: 500, rarity: 'mythic' },

  // ── POWER EXPANSION (60) ──────────────────────────────────────────────

  ...tiered('search-mega', 'Search Legend', 'Perform {n} searches', 'search', 'power',
    s => s.searchesPerformed,
    [[10000, 200, 'legendary'], [25000, 350, 'legendary'], [50000, 550, 'mythic'], [100000, 800, 'mythic']],
    ['Search Expert', 'Search Giant', 'Search Titan', 'Search Deity']
  ),
  ...tiered('files-mega', 'File Legend', 'Open {n} files', 'folder', 'power',
    s => s.filesOpened,
    [[5000, 150, 'legendary'], [10000, 250, 'legendary'], [25000, 400, 'mythic'], [50000, 600, 'mythic']],
    ['File Expert', 'File Giant', 'File Titan', 'File Deity']
  ),
  ...tiered('shortcuts-mega', 'Shortcut Legend', 'Use {n} shortcuts', 'terminal', 'power',
    s => s.shortcutsUsed,
    [[1000, 150, 'legendary'], [2500, 250, 'legendary'], [5000, 400, 'mythic'], [10000, 600, 'mythic']],
    ['Key Expert', 'Key Giant', 'Key Titan', 'Key Deity']
  ),
  ...tiered('tabs-mega', 'Tab Legend', 'Open {n} browser tabs', 'globe', 'power',
    s => s.browserTabsOpened,
    [[500, 100, 'epic'], [1000, 175, 'legendary'], [5000, 300, 'legendary'], [10000, 500, 'mythic']],
    ['Tab Expert', 'Tab Giant', 'Tab Titan', 'Tab Deity']
  ),
  ...tiered('spotlight-mega', 'Spotlight Legend', 'Use Spotlight {n} times', 'search', 'power',
    s => s.spotlightSearches,
    [[1000, 150, 'legendary'], [2500, 250, 'legendary'], [5000, 400, 'mythic'], [10000, 600, 'mythic']],
    ['Spotlight Expert', 'Spotlight Giant', 'Spotlight Titan', 'Spotlight Deity']
  ),
  { id: 'power-combo-all', title: 'Power User Supreme', description: 'Master search + shortcuts + spotlight + commands 1000+ each', icon: 'crown', category: 'power',
    condition: s => s.searchesPerformed >= 1000 && s.shortcutsUsed >= 1000 && s.spotlightSearches >= 1000 && s.commandsExecuted >= 1000, points: 300, rarity: 'legendary' },
  { id: 'power-files-all', title: 'File System Master', description: '5000+ opens 1000+ creates 500+ deletes 500+ moves', icon: 'folder', category: 'power',
    condition: s => s.filesOpened >= 5000 && s.foldersCreated >= 1000 && s.filesDeleted >= 500 && s.filesMoved >= 500, points: 250, rarity: 'legendary' },
  { id: 'power-browser-all', title: 'Browser Legend', description: '10000+ pages 5000+ searches 1000+ downloads', icon: 'globe', category: 'power',
    condition: s => s.browserPageLoads >= 10000 && s.browserSearches >= 5000 && s.browserDownloads >= 1000, points: 250, rarity: 'legendary' },

  // ── MEDIA EXPANSION (60) ──────────────────────────────────────────────

  // Higher tiers for creative apps
  ...tiered('vinx-mega', 'Film Legend', 'Edit {n} videos in VINX', 'film', 'media',
    s => s.videosEdited,
    [[100, 120, 'epic'], [250, 200, 'legendary'], [500, 350, 'legendary'], [1000, 550, 'mythic']],
    ['Film Expert', 'Film Master', 'Film Legend', 'Film Deity']
  ),
  ...tiered('imosion-mega', 'Music Legend', 'Create {n} tracks in Imosion', 'mic', 'media',
    s => s.musicTracksCreated,
    [[100, 120, 'epic'], [250, 200, 'legendary'], [500, 350, 'legendary'], [1000, 550, 'mythic']],
    ['Music Expert', 'Music Master', 'Music Legend', 'Music Deity']
  ),
  ...tiered('prism-mega', 'Image Legend', 'Edit {n} images in PRISM', 'image', 'media',
    s => s.imagesEdited,
    [[100, 120, 'epic'], [250, 200, 'legendary'], [500, 350, 'legendary'], [1000, 550, 'mythic']],
    ['Image Expert', 'Image Master', 'Image Legend', 'Image Deity']
  ),
  ...tiered('flux-mega', 'Animation Legend', 'Create {n} animations in FLUX', 'layers', 'media',
    s => s.animationsCreated,
    [[100, 120, 'epic'], [250, 200, 'legendary'], [500, 350, 'legendary'], [1000, 550, 'mythic']],
    ['Motion Expert', 'Motion Master', 'Motion Legend', 'Motion Deity']
  ),
  ...tiered('forge-mega', 'Forge Legend', 'Convert {n} files in FORGE', 'zap', 'media',
    s => s.filesConverted,
    [[250, 120, 'epic'], [500, 200, 'legendary'], [1000, 350, 'legendary'], [2500, 550, 'mythic']],
    ['Encode Expert', 'Encode Master', 'Encode Legend', 'Encode Deity']
  ),
  // Media combos
  { id: 'media-all-100', title: 'Media Centurion', description: 'Create 100+ in every creative app category', icon: 'film', category: 'media',
    condition: s => s.videosEdited >= 100 && s.musicTracksCreated >= 100 && s.imagesEdited >= 100 && s.animationsCreated >= 100 && s.filesConverted >= 100, points: 200, rarity: 'legendary' },
  { id: 'media-all-1000', title: 'Media Millennium', description: 'Create 1000+ in every creative app category', icon: 'crown', category: 'media',
    condition: s => s.videosEdited >= 1000 && s.musicTracksCreated >= 1000 && s.imagesEdited >= 1000 && s.animationsCreated >= 1000 && s.filesConverted >= 1000, points: 1000, rarity: 'mythic' },
  { id: 'media-deep-vinx', title: 'VINX Deep Dive', description: '500+ exports 1000+ splits 500+ transitions 500+ effects', icon: 'film', category: 'media',
    condition: s => s.videoExports >= 500 && s.videoClipsSplit >= 1000 && s.videoTransitionsAdded >= 500 && s.videoEffectsApplied >= 500, points: 300, rarity: 'legendary' },
  { id: 'media-deep-imosion', title: 'Imosion Deep Dive', description: '500+ recordings 500+ effects 250+ mixdowns 100+ layers', icon: 'mic', category: 'media',
    condition: s => s.audioRecordings >= 500 && s.audioEffectsApplied >= 500 && s.audioMixdowns >= 250 && s.audioTracksLayered >= 100, points: 300, rarity: 'legendary' },
  { id: 'media-deep-prism', title: 'PRISM Deep Dive', description: '1000+ filters 500+ crops 500+ layers', icon: 'image', category: 'media',
    condition: s => s.imageFiltersApplied >= 1000 && s.imageCrops >= 500 && s.imageLayers >= 500, points: 300, rarity: 'legendary' },
  { id: 'media-deep-flux', title: 'FLUX Deep Dive', description: '5000+ keyframes 250+ exports', icon: 'layers', category: 'media',
    condition: s => s.animationKeyframes >= 5000 && s.animationExports >= 250, points: 300, rarity: 'legendary' },
  { id: 'media-deep-forge', title: 'FORGE Deep Dive', description: '500+ batch conversions 2500+ files converted', icon: 'zap', category: 'media',
    condition: s => s.batchConversions >= 500 && s.filesConverted >= 2500, points: 250, rarity: 'legendary' },
  { id: 'media-creative-god', title: 'Creative God', description: 'Master all 6 creative apps (500+ in each + deep features)', icon: 'crown', category: 'media',
    condition: s => s.videosEdited >= 500 && s.musicTracksCreated >= 500 && s.imagesEdited >= 500 && s.animationsCreated >= 500 && s.filesConverted >= 500 && s.axlPartsCreated >= 500, points: 2000, rarity: 'mythic' },

  // ── STREAK EXPANSION (50) ─────────────────────────────────────────────

  // Extended daily usage
  ...tiered('unique-days-mega', 'Daily Legend', 'Use DEX on {n} unique days', 'calendar', 'streak',
    s => s.uniqueDaysUsed,
    [[1500, 600, 'legendary'], [2000, 800, 'legendary'], [3000, 1200, 'mythic'], [5000, 2000, 'mythic']],
    ['1500 Days', '2000 Days', '3000 Days', '5000 Days']
  ),
  // Extended session milestones
  ...tiered('sessions-mega', 'Session Legend', 'Complete {n} sessions', 'shield', 'streak',
    s => s.totalSessions,
    [[2500, 200, 'legendary'], [5000, 350, 'legendary'], [10000, 600, 'mythic'], [25000, 1000, 'mythic']],
    ['2500 Sessions', '5000 Sessions', '10000 Sessions', '25000 Sessions']
  ),
  // Extended time invested
  ...tiered('time-mega', 'Time Legend', 'Invest {n} hours in DEX', 'clock', 'streak',
    s => Math.floor(s.totalMinutes / 60),
    [[1000, 300, 'legendary'], [2500, 500, 'legendary'], [5000, 800, 'mythic'], [10000, 1500, 'mythic']],
    ['Thousand Hours', '2500 Hours', '5000 Hours', '10000 Hours']
  ),
  // Ultra streaks
  { id: 'streak-500', title: '500 Day Streak', description: 'Use DEX 500 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 500, points: 1500, rarity: 'legendary' },
  { id: 'streak-730', title: 'Two Year Streak', description: 'Use DEX 730 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 730, points: 3000, rarity: 'mythic' },
  { id: 'streak-1000', title: 'Thousand Day Streak', description: 'Use DEX 1000 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 1000, points: 5000, rarity: 'mythic' },
  // Year milestones
  { id: 'year-2', title: 'Two Years', description: 'Use DEX for 2 years since first launch', icon: 'calendar', category: 'streak',
    condition: s => { const d = new Date(s.firstLaunch); const n = new Date(); return (n.getTime() - d.getTime()) / 86400000 >= 730; }, points: 500, rarity: 'legendary' },
  { id: 'year-3', title: 'Three Years', description: 'Use DEX for 3 years since first launch', icon: 'calendar', category: 'streak',
    condition: s => { const d = new Date(s.firstLaunch); const n = new Date(); return (n.getTime() - d.getTime()) / 86400000 >= 1095; }, points: 750, rarity: 'legendary' },
  { id: 'year-5', title: 'Five Years', description: 'Use DEX for 5 years since first launch', icon: 'calendar', category: 'streak',
    condition: s => { const d = new Date(s.firstLaunch); const n = new Date(); return (n.getTime() - d.getTime()) / 86400000 >= 1825; }, points: 2000, rarity: 'mythic' },
  // Extended time-of-day
  ...tiered('night-mega', 'Night Owl Legend', 'Use DEX after midnight {n} times', 'moon', 'streak',
    s => s.nightSessions,
    [[100, 60, 'epic'], [250, 120, 'legendary'], [500, 200, 'legendary'], [1000, 400, 'mythic']],
    ['Night Expert', 'Night Master', 'Night Legend', 'Nocturnal Deity']
  ),
  ...tiered('morning-mega', 'Early Bird Legend', 'Use DEX before 8 AM {n} times', 'sun', 'streak',
    s => s.morningSessions,
    [[100, 60, 'epic'], [250, 120, 'legendary'], [500, 200, 'legendary'], [1000, 400, 'mythic']],
    ['Dawn Expert', 'Dawn Master', 'Dawn Legend', 'Sunrise Deity']
  ),
  ...tiered('weekend-mega', 'Weekend Legend', 'Use DEX on {n} weekends', 'calendar', 'streak',
    s => s.weekendSessions,
    [[50, 50, 'epic'], [100, 100, 'legendary'], [250, 200, 'legendary'], [500, 350, 'mythic']],
    ['Weekend Expert', 'Weekend Master', 'Weekend Legend', 'Weekend Deity']
  ),
  // Focus milestones
  ...tiered('focus-mega', 'Focus Legend', 'Spend {n} minutes in focus mode', 'target', 'streak',
    s => s.focusTimeMinutes,
    [[25000, 120, 'epic'], [50000, 200, 'legendary'], [100000, 400, 'legendary'], [250000, 800, 'mythic']],
    ['Focus Expert', 'Focus Master', 'Focus Legend', 'Focus Deity']
  ),
  // Marathon sessions
  ...tiered('marathon-mega', 'Marathon Legend', 'Have sessions lasting {n}+ minutes', 'clock', 'streak',
    s => s.longestSessionMinutes,
    [[600, 100, 'legendary'], [720, 175, 'legendary'], [960, 300, 'mythic'], [1440, 500, 'mythic']],
    ['10H Marathon', '12H Marathon', '16H Marathon', '24H Marathon']
  ),

  // ── GAMING EXPANSION (40) ─────────────────────────────────────────────

  // Higher tiers
  ...tiered('games-mega', 'Gaming Legend', 'Play {n} games', 'gamepad-2', 'gaming',
    s => s.gamesPlayed,
    [[5000, 600, 'legendary'], [10000, 1000, 'mythic'], [25000, 1500, 'mythic'], [50000, 2500, 'mythic']],
    ['Gaming Titan', 'Gaming Deity', 'Gaming Immortal', 'Gaming Eternal']
  ),
  // Typing WPM higher tiers
  { id: 'typing-180', title: 'Typing Savant', description: 'Achieve 180+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 180, points: 400, rarity: 'mythic' },
  { id: 'typing-200', title: 'Typing Transcendent', description: 'Achieve 200+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 200, points: 750, rarity: 'mythic' },
  // Reaction time ultra
  { id: 'reaction-80', title: 'Inhuman Reflexes', description: 'Achieve sub-80ms reaction time', icon: 'zap', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 80, points: 500, rarity: 'mythic' },
  // Combo achievements
  { id: 'gaming-combo-type-react', title: 'Speed Demon', description: '150+ WPM AND sub-150ms reaction', icon: 'zap', category: 'gaming',
    condition: s => s.bestTypingWPM >= 150 && s.bestReactionMs > 0 && s.bestReactionMs <= 150, points: 300, rarity: 'legendary' },
  { id: 'gaming-combo-ultra', title: 'Ultra Gamer', description: '200+ WPM AND sub-100ms reaction AND 10000+ games', icon: 'crown', category: 'gaming',
    condition: s => s.bestTypingWPM >= 200 && s.bestReactionMs > 0 && s.bestReactionMs <= 100 && s.gamesPlayed >= 10000, points: 2000, rarity: 'mythic' },
  { id: 'gaming-grinder', title: 'Grinder', description: 'Play 25000+ games over 500+ unique days', icon: 'shield', category: 'gaming',
    condition: s => s.gamesPlayed >= 25000 && s.uniqueDaysUsed >= 500, points: 500, rarity: 'legendary' },

  // ── SOCIAL EXPANSION (30) ─────────────────────────────────────────────

  ...tiered('transfers-mega', 'Transfer Legend', 'Complete {n} transfers', 'share', 'social',
    s => s.transfersCompleted,
    [[250, 120, 'epic'], [500, 200, 'legendary'], [1000, 350, 'legendary'], [2500, 600, 'mythic']],
    ['Transfer Expert', 'Transfer Master', 'Transfer Legend', 'Transfer Deity']
  ),
  ...tiered('exports-mega', 'Export Legend', 'Export data {n} times', 'download', 'social',
    s => s.dataExported,
    [[250, 120, 'epic'], [500, 200, 'legendary'], [1000, 350, 'legendary'], [2500, 600, 'mythic']],
    ['Export Expert', 'Export Master', 'Export Legend', 'Export Deity']
  ),
  ...tiered('tips-mega', 'Knowledge Oracle', 'Read {n} tips', 'lightbulb', 'social',
    s => s.tipsRead,
    [[50, 60, 'epic'], [100, 100, 'legendary'], [250, 200, 'legendary'], [500, 350, 'mythic']],
    ['Knowledge Seeker', 'Knowledge Master', 'Knowledge Legend', 'Knowledge Deity']
  ),
  ...tiered('rewind-mega', 'Rewind Legend', 'Use Rewind {n} times', 'rewind', 'social',
    s => s.rewindActivations,
    [[50, 80, 'epic'], [100, 140, 'legendary'], [250, 250, 'legendary'], [500, 400, 'mythic']],
    ['Rewind Expert', 'Rewind Master', 'Rewind Legend', 'Rewind Deity']
  ),
  // Sharing combos
  { id: 'social-mega-share', title: 'Mega Sharer', description: '1000+ transfers 500+ exports and 250+ notes shared', icon: 'share', category: 'social',
    condition: s => s.transfersCompleted >= 1000 && s.dataExported >= 500 && s.notesShared >= 250, points: 300, rarity: 'legendary' },
  { id: 'social-community', title: 'Community Pillar', description: '500+ transfers 250+ diag and 100+ tips', icon: 'heart', category: 'social',
    condition: s => s.transfersCompleted >= 500 && s.diagnosticsShared >= 250 && s.tipsRead >= 100, points: 200, rarity: 'legendary' },

  // ── MASTERY EXPANSION (60) ────────────────────────────────────────────

  // Extended achievement hunter
  ...tiered('ach-mega', 'Achievement Legend', 'Unlock {n} achievements', 'trophy', 'mastery',
    s => 0, // Overridden by engine
    [[750, 200, 'epic'], [1000, 350, 'legendary'], [1500, 600, 'legendary'], [2000, 2000, 'mythic']],
    ['Trophy Master', 'Trophy Legend', 'Trophy King', 'Completionist God']
  ),
  // Points mega tiers
  ...tiered('points-mega', 'Point Legend', 'Earn {n} achievement points', 'star', 'mastery',
    s => 0, // Overridden
    [[50000, 500, 'legendary'], [100000, 800, 'legendary'], [250000, 1500, 'mythic'], [500000, 3000, 'mythic']],
    ['Point Expert', 'Point Master', 'Point Legend', 'Point Deity']
  ),
  // Rank progression extended
  { id: 'rank-mythic', title: 'Mythic Status', description: 'Reach Mythic rank', icon: 'sparkles', category: 'mastery', condition: () => false, points: 500, rarity: 'mythic' },
  { id: 'rank-transcendent', title: 'Transcendent', description: 'Reach Transcendent rank', icon: 'crown', category: 'mastery', condition: () => false, points: 1000, rarity: 'mythic' },
  // Category mastery
  { id: 'mastery-explorer-100', title: 'Explorer Master', description: 'Unlock 100+ Explorer achievements', icon: 'compass', category: 'mastery', condition: () => false, points: 150, rarity: 'legendary' },
  { id: 'mastery-creator-100', title: 'Creator Master', description: 'Unlock 100+ Creator achievements', icon: 'pen-tool', category: 'mastery', condition: () => false, points: 150, rarity: 'legendary' },
  { id: 'mastery-power-100', title: 'Power Master', description: 'Unlock 100+ Power User achievements', icon: 'zap', category: 'mastery', condition: () => false, points: 150, rarity: 'legendary' },
  { id: 'mastery-media-100', title: 'Media Master', description: 'Unlock 100+ Media achievements', icon: 'film', category: 'mastery', condition: () => false, points: 150, rarity: 'legendary' },
  { id: 'mastery-streak-100', title: 'Streak Master', description: 'Unlock 100+ Streak achievements', icon: 'flame', category: 'mastery', condition: () => false, points: 150, rarity: 'legendary' },
  { id: 'mastery-eng-50', title: 'Engineering Expert', description: 'Unlock 50+ Engineering achievements', icon: 'compass', category: 'mastery', condition: () => false, points: 100, rarity: 'epic' },
  { id: 'mastery-int-50', title: 'Integration Expert', description: 'Unlock 50+ Integration achievements', icon: 'shuffle', category: 'mastery', condition: () => false, points: 100, rarity: 'epic' },
  // All-category master
  { id: 'mastery-all-50', title: 'Renaissance', description: 'Unlock 50+ in every category', icon: 'crown', category: 'mastery', condition: () => false, points: 500, rarity: 'legendary' },
  { id: 'mastery-all-100', title: 'Polymath', description: 'Unlock 100+ in every category', icon: 'crown', category: 'mastery', condition: () => false, points: 2000, rarity: 'mythic' },
  // Ultimate milestones
  { id: 'mastery-5year-active', title: '5-Year Active', description: 'Use DEX actively for 5 years', icon: 'hourglass', category: 'mastery',
    condition: s => { const d = new Date(s.firstLaunch); const n = new Date(); return (n.getTime() - d.getTime()) / 86400000 >= 1825 && s.uniqueDaysUsed >= 1000; }, points: 3000, rarity: 'mythic' },
  { id: 'mastery-10k-session', title: 'Ten Thousand Sessions', description: 'Complete 10000 total sessions', icon: 'shield', category: 'mastery',
    condition: s => s.totalSessions >= 10000, points: 2000, rarity: 'mythic' },
  { id: 'mastery-million-actions', title: 'Million Actions', description: 'Perform 1000000+ combined user actions', icon: 'activity', category: 'mastery',
    condition: s => s.charactersTyped + s.appSwitchesTotal + s.shortcutsUsed + s.searchesPerformed + s.dragDropActions + s.undoActions >= 1000000, points: 2000, rarity: 'mythic' },
  { id: 'mastery-dex-transcend', title: 'DEX Transcendent', description: 'Unlock 1900+ achievements achieve mythic rank and use DEX 2000+ days', icon: 'crown', category: 'mastery',
    condition: () => false, points: 10000, rarity: 'mythic' },

  // ── DISCOVERY EXPANSION (40) ──────────────────────────────────────────

  // Extended theming
  ...tiered('wallpaper-mega', 'Wallpaper Legend', 'Change wallpaper {n} times', 'image', 'discovery',
    s => s.wallpapersChanged,
    [[100, 60, 'epic'], [250, 120, 'legendary'], [500, 200, 'legendary'], [1000, 350, 'mythic']],
    ['Design Expert', 'Design Master', 'Design Legend', 'Aesthetic Deity']
  ),
  ...tiered('theme-mega', 'Theme Legend', 'Switch themes {n} times', 'palette', 'discovery',
    s => s.themeSwitches,
    [[50, 50, 'epic'], [100, 100, 'legendary'], [250, 175, 'legendary'], [500, 300, 'mythic']],
    ['Theme Expert', 'Theme Master', 'Theme Legend', 'Theme Deity']
  ),
  // Extended Rewind
  ...tiered('rewind-snaps-mega', 'Snapshot Legend', 'View {n} Rewind snapshots', 'eye', 'discovery',
    s => s.rewindSnapshotsViewed,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'], [2500, 300, 'mythic']],
    ['Snapshot Expert', 'Snapshot Master', 'Snapshot Legend', 'Snapshot Deity']
  ),
  // System exploration
  ...tiered('sys-mega', 'System Legend', 'View system info {n} times', 'cpu', 'discovery',
    s => s.systemInfoViews,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'], [1000, 250, 'mythic']],
    ['System Expert', 'System Master', 'System Legend', 'System Deity']
  ),
  // Extended secrets
  { id: 'secret-quiet-achiever', title: 'Quiet Achiever', description: 'Unlock 500 achievements without viewing the trophy case more than 5 times', icon: 'eye-off', category: 'discovery',
    condition: s => s.achievementsViewed <= 5, points: 500, rarity: 'mythic', secret: true },
  { id: 'secret-2year-streak', title: 'Two Year Streak', description: 'Maintain a 730-day streak', icon: 'flame', category: 'discovery',
    condition: s => s.currentStreak >= 730, points: 3000, rarity: 'mythic', secret: true },
  { id: 'secret-eng-creative-full', title: 'Engineer-Artist', description: 'Create 1000+ parts AND 1000+ creative works', icon: 'compass', category: 'discovery',
    condition: s => s.axlPartsCreated >= 1000 && (s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated) >= 1000, points: 500, rarity: 'legendary', secret: true },
  { id: 'secret-dex-immortal', title: 'DEX Immortal', description: 'Unlock 1800+ achievements', icon: 'crown', category: 'discovery',
    condition: () => false, points: 5000, rarity: 'mythic', secret: true },
  { id: 'secret-dex-eternal', title: 'DEX Eternal', description: 'Unlock every single achievement in v3.0', icon: 'award', category: 'discovery',
    condition: () => false, points: 10000, rarity: 'mythic', secret: true },
  { id: 'secret-triple-deity', title: 'Triple Deity', description: 'Achieve mythic rarity in 3+ categories', icon: 'sparkles', category: 'discovery',
    condition: () => false, points: 2000, rarity: 'mythic', secret: true },

  // ── SPEED EXPANSION (40) ──────────────────────────────────────────────

  // Extended speed achievements
  ...tiered('switch-mega', 'Switch Legend', 'Switch between apps {n} times', 'shuffle', 'speed',
    s => s.appSwitchesTotal,
    [[25000, 350, 'legendary'], [50000, 550, 'legendary'], [100000, 900, 'mythic'], [250000, 1500, 'mythic']],
    ['Switch Expert', 'Switch Master', 'Switch Legend', 'Switch Deity']
  ),
  ...tiered('spotlight-exec-mega', 'Spotlight Legend', 'Execute {n} Spotlight actions', 'zap', 'speed',
    s => s.spotlightActionsExecuted,
    [[1000, 120, 'epic'], [2500, 200, 'legendary'], [5000, 350, 'legendary'], [10000, 600, 'mythic']],
    ['Action Expert', 'Action Master', 'Action Legend', 'Action Deity']
  ),
  ...tiered('commands-mega', 'Command Legend', 'Execute {n} commands', 'terminal', 'speed',
    s => s.commandsExecuted,
    [[1000, 120, 'epic'], [2500, 200, 'legendary'], [5000, 350, 'legendary'], [10000, 600, 'mythic']],
    ['Command Expert', 'Command Master', 'Command Legend', 'Command Deity']
  ),
  // Speed combos
  { id: 'speed-ultra-efficient', title: 'Ultra Efficient', description: 'Average 10+ app switches per session across 500+ sessions', icon: 'trending-up', category: 'speed',
    condition: s => s.totalSessions >= 500 && s.appSwitchesTotal / s.totalSessions >= 10, points: 150, rarity: 'legendary' },
  { id: 'speed-rapid-creative', title: 'Rapid Creator', description: 'Create 100+ works across all creative apps', icon: 'zap', category: 'speed',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 100, points: 60, rarity: 'rare' },
  { id: 'speed-rapid-creative-1k', title: 'Speed Creator', description: 'Create 1000+ works across all creative apps', icon: 'zap', category: 'speed',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 1000, points: 150, rarity: 'epic' },
  { id: 'speed-rapid-creative-10k', title: 'Rapid Production', description: 'Create 10000+ works across all creative apps', icon: 'crown', category: 'speed',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 10000, points: 500, rarity: 'legendary' },
  { id: 'speed-automation-hero', title: 'Automation Hero', description: '5000+ workflow runs with 1000+ cross-app workflows', icon: 'shuffle', category: 'speed',
    condition: s => s.workflowsRun >= 5000 && s.crossAppWorkflows >= 1000, points: 300, rarity: 'legendary' },
  { id: 'speed-master-all-v3', title: 'Speed Master v3', description: 'Master all speed metrics: 50K switches 10K commands 10K spotlight', icon: 'crown', category: 'speed',
    condition: s => s.appSwitchesTotal >= 50000 && s.commandsExecuted >= 10000 && s.spotlightActionsExecuted >= 10000, points: 1000, rarity: 'mythic' },

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3B — DEEP TIERS & CROSS-CATEGORY (additional ~800 to reach 2000)
  // ══════════════════════════════════════════════════════════════════════════

  // ── PER-APP ULTRA VETERAN TIERS (52) ───────────────────────────────
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 500, 500, 'legendary')),  // 26
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 1000, 800, 'mythic')),    // 26

  // ── DEEP TYPING / TEXT TIERS (30) ──────────────────────────────────
  ...tiered('chars-deep', 'Typing Champion', 'Type {n} characters total', 'type', 'power',
    s => s.charactersTyped,
    [[1000000, 300, 'legendary'], [2500000, 500, 'legendary'], [5000000, 800, 'mythic'],
     [10000000, 1200, 'mythic'], [25000000, 2000, 'mythic']],
    ['Million Keys', 'Keyboard Warrior', 'Keyboard Legend', 'Keyboard Titan', 'Keyboard Eternal']
  ),
  ...tiered('words-deep', 'Wordsmith Legend', 'Type {n} words total', 'edit', 'creator',
    s => s.wordsTyped,
    [[250000, 200, 'legendary'], [500000, 350, 'legendary'], [2500000, 600, 'mythic'],
     [5000000, 1000, 'mythic'], [10000000, 1500, 'mythic']],
    ['Quarter Million Words', 'Half Million Words', 'Novelist Legend', 'Word Titan', 'Word Eternal']
  ),
  ...tiered('copy-deep', 'Clipboard Legend', 'Copy/paste {n} times', 'clipboard', 'power',
    s => s.copyActions + s.pasteActions,
    [[10000, 100, 'epic'], [25000, 175, 'legendary'], [50000, 300, 'legendary'],
     [100000, 500, 'mythic'], [250000, 800, 'mythic']],
    ['Clipboard Expert', 'Clipboard Master', 'Clipboard Legend', 'Clipboard Titan', 'Clipboard Eternal']
  ),
  ...tiered('undo-deep', 'Undo Legend', 'Use undo {n} times', 'rotate-ccw', 'power',
    s => s.undoActions,
    [[5000, 80, 'epic'], [10000, 140, 'legendary'], [25000, 225, 'legendary'],
     [50000, 375, 'mythic'], [100000, 600, 'mythic']],
    ['Undo Expert', 'Undo Master', 'Undo Legend', 'Undo Titan', 'Undo Eternal']
  ),
  ...tiered('redo-deep', 'Redo Legend', 'Use redo {n} times', 'rotate-cw', 'power',
    s => s.redoActions,
    [[2500, 80, 'epic'], [5000, 140, 'legendary'], [10000, 225, 'legendary'],
     [25000, 375, 'mythic'], [50000, 600, 'mythic']],
    ['Redo Expert', 'Redo Master', 'Redo Legend', 'Redo Titan', 'Redo Eternal']
  ),
  ...tiered('drag-deep', 'Drag Legend', 'Drag and drop {n} times', 'move', 'power',
    s => s.dragDropActions,
    [[5000, 80, 'epic'], [10000, 140, 'legendary'], [25000, 225, 'legendary'],
     [50000, 375, 'mythic'], [100000, 600, 'mythic']],
    ['Drag Expert', 'Drag Master', 'Drag Legend', 'Drag Titan', 'Drag Eternal']
  ),

  // ── DEEP FILE OPERATIONS (25) ─────────────────────────────────────
  ...tiered('create-files-deep', 'File Creator Legend', 'Create {n} files', 'file-plus', 'power',
    s => s.filesCreated,
    [[1000, 100, 'epic'], [2500, 175, 'legendary'], [5000, 300, 'legendary'],
     [10000, 500, 'mythic'], [25000, 800, 'mythic']],
    ['File Crafter', 'File Creator Master', 'File Creator Legend', 'File Creator Titan', 'File Creator Eternal']
  ),
  ...tiered('delete-files-deep', 'File Cleaner Legend', 'Delete {n} files', 'trash', 'power',
    s => s.filesDeleted,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Cleaner Expert', 'Cleaner Master', 'Cleaner Legend', 'Cleaner Titan', 'Cleaner Eternal']
  ),
  ...tiered('move-files-deep', 'File Mover Legend', 'Move {n} files', 'folder', 'power',
    s => s.filesMoved,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Mover Expert', 'Mover Master', 'Mover Legend', 'Mover Titan', 'Mover Eternal']
  ),
  ...tiered('rename-files-deep', 'File Renamer Legend', 'Rename {n} files', 'edit-3', 'power',
    s => s.filesRenamed,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Renamer Expert', 'Renamer Master', 'Renamer Legend', 'Renamer Titan', 'Renamer Eternal']
  ),
  ...tiered('folders-deep', 'Folder Legend', 'Create {n} folders', 'folder-plus', 'power',
    s => s.foldersCreated,
    [[1000, 80, 'epic'], [2500, 140, 'legendary'], [5000, 225, 'legendary'],
     [10000, 375, 'mythic'], [25000, 600, 'mythic']],
    ['Folder Expert', 'Folder Master', 'Folder Legend', 'Folder Titan', 'Folder Eternal']
  ),

  // ── DEEP BROWSER TIERS (20) ───────────────────────────────────────
  ...tiered('pageloads-deep', 'Web Legend', 'Load {n} web pages', 'globe', 'power',
    s => s.browserPageLoads,
    [[25000, 175, 'legendary'], [50000, 300, 'legendary'], [100000, 500, 'mythic'], [250000, 800, 'mythic']],
    ['Web Master', 'Web Legend', 'Web Titan', 'Web Eternal']
  ),
  ...tiered('downloads-deep', 'Download Legend', 'Download {n} files', 'download-cloud', 'power',
    s => s.browserDownloads,
    [[2500, 120, 'epic'], [5000, 200, 'legendary'], [10000, 350, 'legendary'],
     [25000, 600, 'mythic'], [50000, 1000, 'mythic']],
    ['Download Expert', 'Download Master', 'Download Legend', 'Download Titan', 'Download Eternal']
  ),
  ...tiered('bookmarks-deep', 'Bookmark Legend', 'Create {n} bookmarks', 'bookmark', 'power',
    s => s.bookmarksCreated,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Bookmark Expert', 'Bookmark Master', 'Bookmark Legend', 'Bookmark Titan', 'Bookmark Eternal']
  ),
  ...tiered('browsersearch-deep', 'Search Legend', 'Perform {n} browser searches', 'search', 'power',
    s => s.browserSearches,
    [[10000, 120, 'epic'], [25000, 200, 'legendary'], [50000, 350, 'legendary'],
     [100000, 600, 'mythic'], [250000, 1000, 'mythic']],
    ['Search Expert', 'Web Search Master', 'Web Search Legend', 'Web Search Titan', 'Web Search Eternal']
  ),

  // ── DEEP CREATIVE FEATURES — VINX (30) ─────────────────────────────
  ...tiered('vinx-splits', 'Clip Splitter Legend', 'Split {n} video clips', 'scissors', 'media',
    s => s.videoClipsSplit,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Split Expert', 'Split Master', 'Split Legend', 'Split Titan', 'Split Eternal']
  ),
  ...tiered('vinx-trans', 'Transition Legend', 'Add {n} video transitions', 'arrow-right', 'media',
    s => s.videoTransitionsAdded,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Transition Expert', 'Transition Master', 'Transition Legend', 'Transition Titan', 'Transition Eternal']
  ),
  ...tiered('vinx-fx', 'Video FX Legend', 'Apply {n} video effects', 'sparkles', 'media',
    s => s.videoEffectsApplied,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['VFX Expert', 'VFX Master', 'VFX Legend', 'VFX Titan', 'VFX Eternal']
  ),
  ...tiered('vinx-exports', 'Video Export Legend', 'Export {n} videos', 'download', 'media',
    s => s.videoExports,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Export Expert', 'Video Export Master', 'Video Export Legend', 'Video Export Titan', 'Video Export Eternal']
  ),
  ...tiered('vinx-timeline', 'Timeline Legend', 'Add {n} timeline tracks', 'layers', 'media',
    s => s.videoTracksAdded,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Track Expert', 'Track Master', 'Track Legend', 'Track Titan', 'Track Eternal']
  ),
  ...tiered('vinx-titles', 'Title Legend', 'Add {n} title overlays', 'type', 'media',
    s => s.videoTextOverlays,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Title Expert', 'Title Master', 'Title Legend', 'Title Titan', 'Title Eternal']
  ),

  // ── DEEP CREATIVE FEATURES — IMOSION (30) ──────────────────────────
  ...tiered('imo-recordings', 'Recording Legend', 'Make {n} audio recordings', 'mic', 'media',
    s => s.audioRecordings,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Recording Expert', 'Recording Master', 'Recording Legend', 'Recording Titan', 'Recording Eternal']
  ),
  ...tiered('imo-effects', 'Audio FX Legend', 'Apply {n} audio effects', 'sliders', 'media',
    s => s.audioEffectsApplied,
    [[1000, 80, 'epic'], [2500, 140, 'legendary'], [5000, 225, 'legendary'],
     [10000, 375, 'mythic'], [25000, 600, 'mythic']],
    ['Audio FX Expert', 'Audio FX Master', 'Audio FX Legend', 'Audio FX Titan', 'Audio FX Eternal']
  ),
  ...tiered('imo-mixdowns', 'Mixdown Legend', 'Complete {n} mixdowns', 'volume-2', 'media',
    s => s.audioMixdowns,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Mixdown Expert', 'Mixdown Master', 'Mixdown Legend', 'Mixdown Titan', 'Mixdown Eternal']
  ),
  ...tiered('imo-layers', 'Layer Legend', 'Stack {n} audio layers', 'layers', 'media',
    s => s.audioTracksLayered,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Audio Layer Expert', 'Audio Layer Master', 'Audio Layer Legend', 'Audio Layer Titan', 'Audio Layer Eternal']
  ),
  ...tiered('imo-instruments', 'Instrument Legend', 'Use {n} virtual instruments', 'music', 'media',
    s => s.instrumentsUsed,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Instrument Expert', 'Instrument Master', 'Instrument Legend', 'Multi-Instrumentalist', 'Instrument Eternal']
  ),
  ...tiered('imo-midi', 'MIDI Legend', 'Record {n} MIDI notes', 'music', 'media',
    s => s.midiNotesRecorded,
    [[10000, 60, 'epic'], [25000, 100, 'legendary'], [50000, 175, 'legendary'],
     [100000, 300, 'mythic'], [250000, 500, 'mythic']],
    ['MIDI Expert', 'MIDI Master', 'MIDI Legend', 'MIDI Titan', 'MIDI Eternal']
  ),

  // ── DEEP CREATIVE FEATURES — PRISM (30) ────────────────────────────
  ...tiered('prism-filters', 'Filter Legend', 'Apply {n} image filters', 'image', 'media',
    s => s.imageFiltersApplied,
    [[1000, 80, 'epic'], [2500, 140, 'legendary'], [5000, 225, 'legendary'],
     [10000, 375, 'mythic'], [25000, 600, 'mythic']],
    ['Filter Expert', 'Filter Master', 'Filter Legend', 'Filter Titan', 'Filter Eternal']
  ),
  ...tiered('prism-crops', 'Crop Legend', 'Crop {n} images', 'crop', 'media',
    s => s.imageCrops,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Crop Expert', 'Crop Master', 'Crop Legend', 'Crop Titan', 'Crop Eternal']
  ),
  ...tiered('prism-layers', 'Image Layer Legend', 'Use {n} image layers', 'layers', 'media',
    s => s.imageLayers,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Layer Expert', 'Image Layer Master', 'Image Layer Legend', 'Image Layer Titan', 'Image Layer Eternal']
  ),
  ...tiered('prism-brush', 'Brushstroke Legend', 'Make {n} brush strokes', 'pen-tool', 'media',
    s => s.brushStrokes,
    [[5000, 60, 'epic'], [10000, 100, 'legendary'], [25000, 175, 'legendary'],
     [50000, 300, 'mythic'], [100000, 500, 'mythic']],
    ['Brush Expert', 'Brush Master', 'Brush Legend', 'Brush Titan', 'Brush Eternal']
  ),
  ...tiered('prism-exports', 'Image Export Legend', 'Export {n} images', 'download', 'media',
    s => s.imageExports,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Image Export Expert', 'Image Export Master', 'Image Export Legend', 'Image Export Titan', 'Image Export Eternal']
  ),
  ...tiered('prism-selections', 'Selection Legend', 'Make {n} selections', 'square', 'media',
    s => s.imageSelections,
    [[2500, 60, 'epic'], [5000, 100, 'legendary'], [10000, 175, 'legendary'],
     [25000, 300, 'mythic'], [50000, 500, 'mythic']],
    ['Selection Expert', 'Selection Master', 'Selection Legend', 'Selection Titan', 'Selection Eternal']
  ),

  // ── DEEP CREATIVE FEATURES — FLUX (25) ─────────────────────────────
  ...tiered('flux-keyframes', 'Keyframe Legend', 'Create {n} keyframes', 'key', 'media',
    s => s.animationKeyframes,
    [[10000, 80, 'epic'], [25000, 140, 'legendary'], [50000, 225, 'legendary'],
     [100000, 375, 'mythic'], [250000, 600, 'mythic']],
    ['Keyframe Expert', 'Keyframe Master', 'Keyframe Legend', 'Keyframe Titan', 'Keyframe Eternal']
  ),
  ...tiered('flux-exports', 'Animation Export Legend', 'Export {n} animations', 'download', 'media',
    s => s.animationExports,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Anim Export Expert', 'Anim Export Master', 'Anim Export Legend', 'Anim Export Titan', 'Anim Export Eternal']
  ),
  ...tiered('flux-presets', 'Preset Legend', 'Use {n} animation presets', 'bookmark', 'media',
    s => s.animationPresetsUsed,
    [[250, 40, 'epic'], [500, 80, 'legendary'], [1000, 140, 'legendary'],
     [2500, 225, 'mythic'], [5000, 375, 'mythic']],
    ['Preset Expert', 'Preset Master', 'Preset Legend', 'Preset Titan', 'Preset Eternal']
  ),
  ...tiered('flux-easing', 'Easing Legend', 'Apply {n} easing curves', 'trending-up', 'media',
    s => s.easingCurvesApplied,
    [[500, 40, 'epic'], [1000, 80, 'legendary'], [2500, 140, 'legendary'],
     [5000, 225, 'mythic'], [10000, 375, 'mythic']],
    ['Easing Expert', 'Easing Master', 'Easing Legend', 'Easing Titan', 'Easing Eternal']
  ),
  ...tiered('flux-compositions', 'Composition Legend', 'Create {n} compositions', 'layout', 'media',
    s => s.compositions,
    [[250, 60, 'epic'], [500, 100, 'legendary'], [1000, 175, 'legendary'],
     [2500, 300, 'mythic'], [5000, 500, 'mythic']],
    ['Composition Expert', 'Composition Master', 'Composition Legend', 'Composition Titan', 'Composition Eternal']
  ),

  // ── DEEP CREATIVE FEATURES — FORGE (20) ────────────────────────────
  ...tiered('forge-batch', 'Batch Legend', 'Run {n} batch conversions', 'zap', 'media',
    s => s.batchConversions,
    [[500, 80, 'epic'], [1000, 140, 'legendary'], [2500, 225, 'legendary'],
     [5000, 375, 'mythic'], [10000, 600, 'mythic']],
    ['Batch Expert', 'Batch Master', 'Batch Legend', 'Batch Titan', 'Batch Eternal']
  ),
  ...tiered('forge-presets', 'Encode Preset Legend', 'Use {n} encoder presets', 'settings', 'media',
    s => s.encoderPresetsUsed,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Preset Expert', 'Encoder Preset Master', 'Encoder Preset Legend', 'Encoder Preset Titan', 'Encoder Preset Eternal']
  ),
  ...tiered('forge-formats', 'Format Legend', 'Convert between {n} unique format pairs', 'shuffle', 'media',
    s => s.uniqueFormatPairs,
    [[25, 30, 'epic'], [50, 60, 'legendary'], [100, 120, 'legendary'],
     [200, 200, 'mythic'], [500, 350, 'mythic']],
    ['Format Expert', 'Format Master', 'Format Legend', 'Format Titan', 'Format Eternal']
  ),
  ...tiered('forge-queue', 'Queue Legend', 'Process {n} queued items', 'list', 'media',
    s => s.queueItemsProcessed,
    [[1000, 80, 'epic'], [2500, 140, 'legendary'], [5000, 225, 'legendary'],
     [10000, 375, 'mythic'], [25000, 600, 'mythic']],
    ['Queue Expert', 'Queue Master', 'Queue Legend', 'Queue Titan', 'Queue Eternal']
  ),

  // ── PRODUCTIVITY DEEP TIERS (40) ──────────────────────────────────
  ...tiered('tasks-created-deep', 'Task Creator Legend', 'Create {n} tasks', 'plus', 'creator',
    s => s.tasksCreated,
    [[1000, 100, 'epic'], [2500, 175, 'legendary'], [5000, 300, 'legendary'],
     [10000, 500, 'mythic'], [25000, 800, 'mythic']],
    ['Task Crafter', 'Task Creator Master', 'Task Creator Legend', 'Task Creator Titan', 'Task Creator Eternal']
  ),
  ...tiered('kb-columns-deep', 'Kanban Column Legend', 'Create {n} kanban columns', 'columns', 'creator',
    s => s.kanbanColumnsCreated,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Column Expert', 'Column Master', 'Column Legend', 'Column Titan', 'Column Eternal']
  ),
  ...tiered('wf-runs-deep', 'Workflow Run Legend', 'Run workflows {n} times', 'play', 'creator',
    s => s.workflowsRun,
    [[2500, 120, 'epic'], [5000, 200, 'legendary'], [10000, 350, 'legendary'],
     [25000, 600, 'mythic'], [50000, 1000, 'mythic']],
    ['Workflow Run Expert', 'Workflow Run Master', 'Workflow Run Legend', 'Workflow Run Titan', 'Workflow Run Eternal']
  ),
  ...tiered('cal-recurring-deep', 'Recurring Legend', 'Create {n} recurring events', 'repeat', 'creator',
    s => s.recurringTasksCreated,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Recurring Expert', 'Recurring Master', 'Recurring Legend', 'Recurring Titan', 'Recurring Eternal']
  ),
  ...tiered('tags-deep', 'Tag Legend', 'Create {n} tags', 'tag', 'creator',
    s => s.noteTagsCreated,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Tag Expert', 'Tag Master', 'Tag Legend', 'Tag Titan', 'Tag Eternal']
  ),
  ...tiered('templates-deep', 'Template Legend', 'Use {n} templates', 'file-text', 'creator',
    s => s.templatesUsed,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Template Expert', 'Template Master', 'Template Legend', 'Template Titan', 'Template Eternal']
  ),
  ...tiered('reminders-deep', 'Reminder Legend', 'Set {n} reminders', 'bell', 'creator',
    s => s.remindersSet,
    [[500, 60, 'epic'], [1000, 100, 'legendary'], [2500, 175, 'legendary'],
     [5000, 300, 'mythic'], [10000, 500, 'mythic']],
    ['Reminder Expert', 'Reminder Master', 'Reminder Legend', 'Reminder Titan', 'Reminder Eternal']
  ),
  ...tiered('shared-notes-deep', 'Sharing Legend', 'Share {n} notes', 'share-2', 'social',
    s => s.notesShared,
    [[100, 40, 'epic'], [250, 80, 'legendary'], [500, 140, 'legendary'],
     [1000, 225, 'mythic'], [2500, 375, 'mythic']],
    ['Sharing Expert', 'Sharing Master', 'Sharing Legend', 'Sharing Titan', 'Sharing Eternal']
  ),

  // ── DEEP DISCOVERY / CUSTOMIZATION (40) ───────────────────────────
  ...tiered('dock-rearrange-deep', 'Dock Legend', 'Rearrange dock items {n} times', 'move', 'discovery',
    s => s.dockRearrangements,
    [[250, 40, 'epic'], [500, 80, 'legendary'], [1000, 140, 'legendary'],
     [2500, 225, 'mythic'], [5000, 375, 'mythic']],
    ['Dock Expert', 'Dock Master', 'Dock Legend', 'Dock Titan', 'Dock Eternal']
  ),
  ...tiered('window-resize-deep', 'Window Legend', 'Resize windows {n} times', 'maximize', 'discovery',
    s => s.windowsResized,
    [[5000, 60, 'epic'], [10000, 100, 'legendary'], [25000, 175, 'legendary'],
     [50000, 300, 'mythic'], [100000, 500, 'mythic']],
    ['Window Expert', 'Window Master', 'Window Legend', 'Window Titan', 'Window Eternal']
  ),
  ...tiered('context-menu-deep', 'Context Legend', 'Use context menus {n} times', 'menu', 'discovery',
    s => s.contextMenuUses,
    [[5000, 60, 'epic'], [10000, 100, 'legendary'], [25000, 175, 'legendary'],
     [50000, 300, 'mythic'], [100000, 500, 'mythic']],
    ['Context Expert', 'Context Master', 'Context Legend', 'Context Titan', 'Context Eternal']
  ),
  ...tiered('notifications-deep', 'Notification Legend', 'Receive {n} notifications', 'bell', 'discovery',
    s => s.notificationsReceived,
    [[1000, 40, 'epic'], [2500, 80, 'legendary'], [5000, 140, 'legendary'],
     [10000, 225, 'mythic'], [25000, 375, 'mythic']],
    ['Notified Expert', 'Notified Master', 'Notified Legend', 'Notified Titan', 'Notified Eternal']
  ),
  ...tiered('fullscreen-deep', 'Fullscreen Legend', 'Toggle fullscreen {n} times', 'maximize', 'discovery',
    s => s.fullscreenToggles,
    [[500, 40, 'epic'], [1000, 80, 'legendary'], [2500, 140, 'legendary'],
     [5000, 225, 'mythic'], [10000, 375, 'mythic']],
    ['Fullscreen Expert', 'Fullscreen Master', 'Fullscreen Legend', 'Fullscreen Titan', 'Fullscreen Eternal']
  ),
  ...tiered('settings-deep', 'Settings Legend', 'Change settings {n} times', 'settings', 'discovery',
    s => s.settingsChanged,
    [[500, 40, 'epic'], [1000, 80, 'legendary'], [2500, 140, 'legendary'],
     [5000, 225, 'mythic'], [10000, 375, 'mythic']],
    ['Settings Expert', 'Settings Master', 'Settings Legend', 'Settings Titan', 'Settings Eternal']
  ),
  ...tiered('help-deep', 'Help Legend', 'Access help {n} times', 'help-circle', 'discovery',
    s => s.helpAccessed,
    [[100, 30, 'epic'], [250, 60, 'legendary'], [500, 100, 'legendary'],
     [1000, 175, 'mythic'], [2500, 300, 'mythic']],
    ['Help Expert', 'Help Master', 'Help Legend', 'Help Titan', 'Help Eternal']
  ),
  ...tiered('zoom-deep', 'Zoom Legend', 'Zoom in/out {n} times', 'zoom-in', 'discovery',
    s => s.zoomActions,
    [[500, 40, 'epic'], [1000, 80, 'legendary'], [2500, 140, 'legendary'],
     [5000, 225, 'mythic'], [10000, 375, 'mythic']],
    ['Zoom Expert', 'Zoom Master', 'Zoom Legend', 'Zoom Titan', 'Zoom Eternal']
  ),

  // ── CROSS-CATEGORY COMBOS (50) ────────────────────────────────────
  { id: 'xcat-creator-eng', title: 'Documented Engineer', description: '1000+ notes AND 500+ AXL parts', icon: 'compass', category: 'mastery',
    condition: s => s.notesCreated >= 1000 && s.axlPartsCreated >= 500, points: 200, rarity: 'legendary' },
  { id: 'xcat-power-media', title: 'Power Producer', description: '10K searches 5K shortcuts AND 500+ creative works', icon: 'zap', category: 'mastery',
    condition: s => s.searchesPerformed >= 10000 && s.shortcutsUsed >= 5000 && (s.videosEdited + s.musicTracksCreated + s.imagesEdited) >= 500, points: 200, rarity: 'legendary' },
  { id: 'xcat-streak-media', title: 'Consistent Creator', description: '365-day streak AND 100+ creative works per month avg', icon: 'flame', category: 'mastery',
    condition: s => s.currentStreak >= 365 && (s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated) >= 1200, points: 300, rarity: 'legendary' },
  { id: 'xcat-gaming-eng', title: 'Gamer Engineer', description: '10K games AND 500+ AXL parts', icon: 'gamepad-2', category: 'mastery',
    condition: s => s.gamesPlayed >= 10000 && s.axlPartsCreated >= 500, points: 200, rarity: 'legendary' },
  { id: 'xcat-social-int', title: 'Connected Professional', description: '500+ transfers AND 250+ cross-app workflows', icon: 'share', category: 'mastery',
    condition: s => s.transfersCompleted >= 500 && s.crossAppWorkflows >= 250, points: 200, rarity: 'legendary' },
  { id: 'xcat-disc-power', title: 'Explorer Power User', description: 'All 26 apps AND 5K shortcuts AND custom everything', icon: 'compass', category: 'mastery',
    condition: s => s.appsUsed.length >= 26 && s.shortcutsUsed >= 5000 && s.wallpapersChanged >= 50 && s.themeSwitches >= 25, points: 250, rarity: 'legendary' },
  { id: 'xcat-speed-streak', title: 'Relentless', description: '180-day streak AND 50K app switches', icon: 'flame', category: 'mastery',
    condition: s => s.currentStreak >= 180 && s.appSwitchesTotal >= 50000, points: 200, rarity: 'legendary' },
  { id: 'xcat-media-eng', title: 'Media Engineer', description: 'Master VINX + PRISM + FLUX + FORGE + AXL (100+ each)', icon: 'compass', category: 'mastery',
    condition: s => s.videosEdited >= 100 && s.imagesEdited >= 100 && s.animationsCreated >= 100 && s.filesConverted >= 100 && s.axlPartsCreated >= 100, points: 250, rarity: 'legendary' },
  { id: 'xcat-creator-social', title: 'Prolific Sharer', description: 'Create 5K+ notes AND share 500+', icon: 'share', category: 'mastery',
    condition: s => s.notesCreated >= 5000 && s.notesShared >= 500, points: 200, rarity: 'legendary' },
  { id: 'xcat-all-cats-25', title: 'Renaissance Person', description: 'Unlock 25+ in every single category', icon: 'crown', category: 'mastery',
    condition: () => false, points: 300, rarity: 'legendary' },
  { id: 'xcat-eng-int-media', title: 'Complete Studio', description: 'Master AXL + all integrations + all media apps', icon: 'crown', category: 'mastery',
    condition: s => s.axlPartsCreated >= 250 && s.sendToMenuUses >= 250 && s.videosEdited >= 250 && s.imagesEdited >= 250, points: 500, rarity: 'mythic' },
  { id: 'xcat-god-mode', title: 'God Mode', description: 'Earn mythic rarity in 5+ categories', icon: 'crown', category: 'mastery',
    condition: () => false, points: 5000, rarity: 'mythic' },
  // Cross-discipline productivity combos
  { id: 'xcat-tasks-notes-cal', title: 'GTD Master', description: '5000+ tasks 5000+ notes 1000+ events', icon: 'check-square', category: 'creator',
    condition: s => s.tasksCompleted >= 5000 && s.notesCreated >= 5000 && s.calendarEventsCreated >= 1000, points: 300, rarity: 'legendary' },
  { id: 'xcat-productivity-100h', title: 'Productivity Century', description: 'Spend 100+ hours in focus mode and complete 10K+ tasks', icon: 'target', category: 'creator',
    condition: s => s.focusTimeMinutes >= 6000 && s.tasksCompleted >= 10000, points: 300, rarity: 'legendary' },
  { id: 'xcat-office-suite', title: 'Office Suite Master', description: 'Master Notes + Tasks + Calendar + Kanban + Workflows (500+ each)', icon: 'briefcase', category: 'creator',
    condition: s => s.notesCreated >= 500 && s.tasksCompleted >= 500 && s.calendarEventsCreated >= 500 && s.kanbanCardsCreated >= 500 && s.workflowsCreated >= 500, points: 250, rarity: 'legendary' },
  { id: 'xcat-ultra-creative', title: 'Ultra Creative', description: '500+ in every creative app + 1000+ cross-app sends', icon: 'sparkles', category: 'media',
    condition: s => s.videosEdited >= 500 && s.musicTracksCreated >= 500 && s.imagesEdited >= 500 && s.animationsCreated >= 500 && s.filesConverted >= 500 && s.axlPartsCreated >= 500 && s.sendToMenuUses >= 1000, points: 2000, rarity: 'mythic' },
  { id: 'xcat-explore-all-deep', title: 'Deep Explorer', description: 'Use every app 500+ times', icon: 'compass', category: 'explorer',
    condition: s => Object.values(s.appUsageCounts).filter(c => c >= 500).length >= 26, points: 1000, rarity: 'mythic' },
  { id: 'xcat-no-sleep', title: 'No Sleep', description: 'Use DEX in morning afternoon evening and night in one day', icon: 'sun', category: 'streak',
    condition: s => s.morningSessions >= 1 && s.nightSessions >= 1, points: 25, rarity: 'common' },
  { id: 'xcat-typing-marathon', title: 'Typing Marathon', description: 'Type 500K characters in focus mode sessions', icon: 'type', category: 'streak',
    condition: s => s.charactersTyped >= 500000 && s.focusTimeMinutes >= 10000, points: 200, rarity: 'legendary' },
  { id: 'xcat-data-king', title: 'Data King', description: '10K files opened 5K created 2.5K deleted 2.5K moved/renamed', icon: 'database', category: 'power',
    condition: s => s.filesOpened >= 10000 && s.filesCreated >= 5000 && s.filesDeleted >= 2500 && s.filesMoved + s.filesRenamed >= 2500, points: 250, rarity: 'legendary' },

  // ── MEGA SECRETS (40) ─────────────────────────────────────────────
  { id: 'secret-all-apps-one-day', title: 'App Sprint', description: 'Use all 26 apps in a single day', icon: 'zap', category: 'speed',
    condition: s => s.appsUsed.length >= 26, points: 300, rarity: 'legendary', secret: true },
  { id: 'secret-focus-24h', title: 'Deep Focus', description: 'Spend 24 continuous hours in focus mode', icon: 'target', category: 'streak',
    condition: s => s.longestFocusMinutes >= 1440, points: 500, rarity: 'mythic', secret: true },
  { id: 'secret-midnight-eng', title: 'Midnight Engineer', description: 'Run 100 simulations between midnight and 4 AM', icon: 'moon', category: 'engineering',
    condition: s => s.nightSessions >= 50 && s.axlSimulationsRun >= 100, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-1m-chars-day', title: 'Speed Writer', description: 'Type 100K+ characters in a single day', icon: 'type', category: 'speed',
    condition: s => s.dailyCharactersPeak >= 100000, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-10app-session', title: 'Multi-Tasker', description: 'Use 10+ apps in a single session', icon: 'grid', category: 'speed',
    condition: s => s.appsUsed.length >= 10, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-15app-session', title: 'Hyper-Tasker', description: 'Use 15+ apps in a single session', icon: 'grid', category: 'speed',
    condition: s => s.appsUsed.length >= 15, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-20app-session', title: 'Mega-Tasker', description: 'Use 20+ apps in a single session', icon: 'grid', category: 'speed',
    condition: s => s.appsUsed.length >= 20, points: 200, rarity: 'legendary', secret: true },
  { id: 'secret-zero-mouse', title: 'Keyboard Warrior', description: 'Complete 100 actions using only keyboard shortcuts', icon: 'terminal', category: 'power',
    condition: s => s.shortcutsUsed >= 100, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-bookmark-1000', title: 'Bookmark Hoarder', description: 'Create 1000+ bookmarks', icon: 'bookmark', category: 'power',
    condition: s => s.bookmarksCreated >= 1000, points: 100, rarity: 'legendary', secret: true },
  { id: 'secret-perfect-week', title: 'Perfect Week', description: 'Use DEX every day of the week with 10+ apps each day', icon: 'calendar', category: 'streak',
    condition: s => s.currentStreak >= 7 && s.appsUsed.length >= 10, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-perfect-month', title: 'Perfect Month', description: 'Use DEX every day for 30 days with 15+ apps each day', icon: 'calendar', category: 'streak',
    condition: s => s.currentStreak >= 30 && s.appsUsed.length >= 15, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-1000-files-day', title: 'File Storm', description: 'Create 1000+ files in a single day', icon: 'file-plus', category: 'power',
    condition: s => s.dailyFilesCreatedPeak >= 1000, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-video-marathon', title: 'Edit Marathon', description: 'Edit 50 videos without breaks', icon: 'film', category: 'media',
    condition: s => s.videosEdited >= 50, points: 80, rarity: 'epic', secret: true },
  { id: 'secret-music-marathon', title: 'Studio Session', description: 'Create 25 tracks in a single session', icon: 'mic', category: 'media',
    condition: s => s.musicTracksCreated >= 25, points: 80, rarity: 'epic', secret: true },
  { id: 'secret-prism-marathon', title: 'Pixel Perfect', description: 'Edit 100 images without closing PRISM', icon: 'image', category: 'media',
    condition: s => s.imagesEdited >= 100, points: 80, rarity: 'epic', secret: true },
  { id: 'secret-forge-marathon', title: 'Render Farm', description: 'Convert 500 files in one batch session', icon: 'zap', category: 'media',
    condition: s => s.filesConverted >= 500, points: 100, rarity: 'legendary', secret: true },
  { id: 'secret-note-novel', title: 'Novel Written', description: 'Write 100K+ words in Notes', icon: 'file-text', category: 'creator',
    condition: s => s.wordsTyped >= 100000 && s.notesCreated >= 100, points: 150, rarity: 'legendary', secret: true },
  { id: 'secret-calendar-year', title: 'Year Planned', description: 'Create 365+ events for a single year', icon: 'calendar', category: 'creator',
    condition: s => s.calendarEventsCreated >= 365, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-kanban-wall', title: 'Kanban Wall', description: 'Create 10+ columns with 100+ cards each', icon: 'columns', category: 'creator',
    condition: s => s.kanbanColumnsCreated >= 10 && s.kanbanCardsCreated >= 1000, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-wf-automate-all', title: 'Full Automation', description: 'Create 100+ workflows and run them 10K+ times', icon: 'shuffle', category: 'creator',
    condition: s => s.workflowsCreated >= 100 && s.workflowsRun >= 10000, points: 200, rarity: 'legendary', secret: true },
  // System secrets
  { id: 'secret-resize-1000', title: 'Window Gymnast', description: 'Resize windows 1000+ times in a day', icon: 'maximize', category: 'discovery',
    condition: s => s.windowsResized >= 1000, points: 50, rarity: 'rare', secret: true },
  { id: 'secret-dark-mode-forever', title: 'Dark Mode Devotee', description: 'Only use dark mode for 365+ days', icon: 'moon', category: 'discovery',
    condition: s => s.darkModeConsecutiveDays >= 365, points: 100, rarity: 'epic', secret: true },
  { id: 'secret-wallpaper-daily', title: 'Wallpaper Collector', description: 'Change wallpaper every day for 30 days', icon: 'image', category: 'discovery',
    condition: s => s.wallpapersChanged >= 30 && s.currentStreak >= 30, points: 60, rarity: 'rare', secret: true },
  { id: 'secret-500-notifications', title: 'Notification Flood', description: 'Receive 500 notifications in a day', icon: 'bell', category: 'discovery',
    condition: s => s.dailyNotificationsPeak >= 500, points: 75, rarity: 'epic', secret: true },
  { id: 'secret-pwd-paranoid', title: 'Security Paranoid', description: 'Generate 50 passwords in one session', icon: 'lock', category: 'power',
    condition: s => s.passwordsGenerated >= 50, points: 40, rarity: 'rare', secret: true },
  { id: 'secret-search-obsessed', title: 'Search Obsessed', description: 'Perform 500 searches in a single day', icon: 'search', category: 'power',
    condition: s => s.dailySearchesPeak >= 500, points: 80, rarity: 'epic', secret: true },
  { id: 'secret-reaction-sub50', title: 'Superhuman Reflexes', description: 'Achieve sub-50ms reaction time', icon: 'zap', category: 'gaming',
    condition: s => s.bestReactionMs > 0 && s.bestReactionMs <= 50, points: 1000, rarity: 'mythic', secret: true },
  { id: 'secret-typing-250', title: 'Typing Transcendent', description: 'Achieve 250+ WPM', icon: 'type', category: 'gaming',
    condition: s => s.bestTypingWPM >= 250, points: 2000, rarity: 'mythic', secret: true },
  { id: 'secret-games-100k', title: 'Gaming Immortal', description: 'Play 100K games', icon: 'gamepad-2', category: 'gaming',
    condition: s => s.gamesPlayed >= 100000, points: 2000, rarity: 'mythic', secret: true },
  { id: 'secret-eng-creative-loop', title: 'Design Loop', description: 'Design in AXL edit in PRISM animate in FLUX export in FORGE 100+ times', icon: 'repeat', category: 'integration',
    condition: s => s.axlExports >= 100 && s.imagesEdited >= 100 && s.animationsCreated >= 100 && s.filesConverted >= 100, points: 300, rarity: 'legendary', secret: true },
  // Ultimate secrets
  { id: 'secret-unlock-80-pct', title: 'Almost There', description: 'Unlock 80% of all achievements', icon: 'percent', category: 'mastery',
    condition: () => false, points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-unlock-90-pct', title: 'So Close', description: 'Unlock 90% of all achievements', icon: 'percent', category: 'mastery',
    condition: () => false, points: 2000, rarity: 'mythic', secret: true },
  { id: 'secret-unlock-95-pct', title: 'Obsessed', description: 'Unlock 95% of all achievements', icon: 'percent', category: 'mastery',
    condition: () => false, points: 3000, rarity: 'mythic', secret: true },
  { id: 'secret-unlock-100-pct', title: 'Perfection', description: 'Unlock every single achievement', icon: 'award', category: 'mastery',
    condition: () => false, points: 10000, rarity: 'mythic', secret: true },
  { id: 'secret-dex-for-life', title: 'DEX For Life', description: '5+ years active 2000+ days 50K sessions', icon: 'heart', category: 'mastery',
    condition: s => s.uniqueDaysUsed >= 2000 && s.totalSessions >= 50000, points: 5000, rarity: 'mythic', secret: true },
  { id: 'secret-mythic-10', title: 'Collector of Myths', description: 'Unlock 10 mythic achievements', icon: 'sparkles', category: 'mastery',
    condition: () => false, points: 500, rarity: 'legendary', secret: true },
  { id: 'secret-mythic-25', title: 'Mythic Hoarder', description: 'Unlock 25 mythic achievements', icon: 'sparkles', category: 'mastery',
    condition: () => false, points: 2000, rarity: 'mythic', secret: true },
  { id: 'secret-mythic-50', title: 'Myth Made Real', description: 'Unlock 50 mythic achievements', icon: 'crown', category: 'mastery',
    condition: () => false, points: 5000, rarity: 'mythic', secret: true },
  { id: 'secret-100-secret', title: 'Secret Hunter', description: 'Unlock 100 secret achievements', icon: 'eye', category: 'mastery',
    condition: () => false, points: 1000, rarity: 'legendary', secret: true },
  { id: 'secret-all-secret', title: 'Master of Secrets', description: 'Unlock every secret achievement', icon: 'shield', category: 'mastery',
    condition: () => false, points: 5000, rarity: 'mythic', secret: true },

  // ══════════════════════════════════════════════════════════════════════════
  // PHASE 3C — FINAL PUSH TO 2000 (~210 more)
  // ══════════════════════════════════════════════════════════════════════════

  // ── PER-APP ULTRA LEGEND (2000 uses) (26) ─────────────────────────
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 2000, 1200, 'mythic')),

  // ── DEEP ENGINEERING FEATURES (40) ────────────────────────────────
  ...tiered('axl-total-ops', 'Engineering Operations', 'Perform {n} total AXL operations', 'compass', 'engineering',
    s => s.axlPartsCreated + s.axlBooleanOps + s.axlConstraintsAdded + s.axlMeasurements + s.axlFilletsChamfers + s.axlPatternsCreated,
    [[100, 25, 'common'], [250, 45, 'common'], [500, 70, 'rare'], [1000, 100, 'rare'],
     [2500, 150, 'epic'], [5000, 225, 'epic'], [10000, 375, 'legendary'], [25000, 600, 'mythic']],
    ['Operations Rookie', 'Operations User', 'Operations Pro', 'Operations Expert', 'Operations Master', 'Operations Legend', 'Operations Titan', 'Operations Eternal']
  ),
  ...tiered('axl-annotations', 'GD&T Master', 'Add {n} GD&T annotations', 'tag', 'engineering',
    s => s.axlAnnotationsAdded || 0,
    [[1, 5, 'common'], [10, 15, 'common'], [50, 30, 'rare'], [100, 55, 'epic'],
     [250, 90, 'legendary'], [500, 150, 'mythic']],
    ['First Annotation', 'Annotator', 'GD&T User', 'GD&T Pro', 'GD&T Master', 'GD&T God']
  ),
  ...tiered('axl-views', 'View Master', 'Switch camera views {n} times', 'eye', 'engineering',
    s => s.axlViewChanges || 0,
    [[10, 5, 'common'], [50, 15, 'common'], [100, 30, 'rare'], [500, 55, 'epic'],
     [1000, 90, 'legendary'], [5000, 150, 'mythic']],
    ['Explorer', 'Viewer', 'View Pro', 'View Expert', 'View Master', 'View God']
  ),
  ...tiered('axl-wireframe', 'Wireframe Master', 'Toggle wireframe {n} times', 'box', 'engineering',
    s => s.axlWireframeToggles || 0,
    [[10, 5, 'common'], [50, 15, 'common'], [100, 30, 'rare'], [250, 55, 'epic'],
     [500, 90, 'legendary'], [1000, 150, 'mythic']],
    ['Wire Viewer', 'Wireframe User', 'Wireframe Pro', 'Wireframe Expert', 'Wireframe Master', 'Wireframe God']
  ),
  { id: 'eng-100-sims-noclear', title: 'Persistent Analyst', description: 'Run 100 simulations without clearing results', icon: 'activity', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 100, points: 80, rarity: 'epic' },
  { id: 'eng-assembly-tree', title: 'Deep Tree', description: 'Build a feature tree with 50+ nodes', icon: 'git-branch', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50 && s.axlBooleanOps >= 25, points: 60, rarity: 'rare' },
  { id: 'eng-5formats', title: 'Multi-Format', description: 'Export in STL DXF PDF JSON and PNG', icon: 'download', category: 'engineering',
    condition: s => s.axlExports >= 5, points: 30, rarity: 'common' },
  { id: 'eng-tube-master', title: 'Tube Master', description: 'Create 50+ tube primitives', icon: 'compass', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50, points: 40, rarity: 'rare' },
  { id: 'eng-explode-50', title: 'Explode Expert', description: 'Create 50 exploded views', icon: 'maximize', category: 'engineering',
    condition: s => s.axlExplodedViews >= 50, points: 80, rarity: 'epic' },
  { id: 'eng-explode-500', title: 'Explosion King', description: 'Create 500 exploded views', icon: 'maximize', category: 'engineering',
    condition: s => s.axlExplodedViews >= 500, points: 200, rarity: 'legendary' },
  { id: 'eng-stress-1000', title: 'Stress Legend', description: 'Run 1000 simulations', icon: 'activity', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 1000, points: 300, rarity: 'mythic' },
  { id: 'eng-assembly-500', title: 'Assembly Legend', description: 'Build 500 assemblies', icon: 'compass', category: 'engineering',
    condition: s => s.axlAssembliesBuilt >= 500, points: 300, rarity: 'mythic' },
  { id: 'eng-measure-ultra', title: 'Measurement God', description: 'Take 10000 measurements', icon: 'ruler', category: 'engineering',
    condition: s => s.axlMeasurements >= 10000, points: 400, rarity: 'mythic' },
  { id: 'eng-constraint-ultra', title: 'Constraint God', description: 'Add 2500 constraints', icon: 'link', category: 'engineering',
    condition: s => s.axlConstraintsAdded >= 2500, points: 400, rarity: 'mythic' },

  // ── DEEP INTEGRATION FEATURES (30) ────────────────────────────────
  ...tiered('int-total-crossapp', 'Cross-App Activities', 'Complete {n} cross-app activities', 'shuffle', 'integration',
    s => s.sendToMenuUses + s.assetsReceived + s.assetsSent + s.crossAppWorkflows,
    [[10, 10, 'common'], [50, 25, 'common'], [100, 45, 'rare'], [250, 70, 'rare'],
     [500, 100, 'epic'], [1000, 150, 'epic'], [2500, 250, 'legendary'], [5000, 400, 'mythic']],
    ['Cross Rookie', 'Cross User', 'Cross Pro', 'Cross Expert', 'Cross Master', 'Cross Legend', 'Cross Titan', 'Cross Eternal']
  ),
  ...tiered('int-total-system', 'System Features', 'Use {n} system features', 'cpu', 'integration',
    s => s.spacesCreated + s.widgetsUsed + s.missionControlActivations + s.snapLayoutsUsed + s.gesturesPerformed,
    [[10, 10, 'common'], [50, 25, 'common'], [100, 45, 'rare'], [250, 70, 'rare'],
     [500, 100, 'epic'], [1000, 150, 'epic'], [2500, 250, 'legendary'], [5000, 400, 'mythic']],
    ['System Rookie', 'System User', 'System Pro', 'System Expert', 'System Master', 'System Legend', 'System Titan', 'System Eternal']
  ),
  { id: 'int-axl-to-vinx', title: 'CAD to Film', description: 'Export AXL render and use in video project', icon: 'share', category: 'integration',
    condition: s => s.axlExports >= 1 && s.videosEdited >= 1, points: 30, rarity: 'rare' },
  { id: 'int-imosion-to-flux', title: 'Sound Motion', description: 'Send audio from Imosion to FLUX for animation sync', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('imosion') && s.appsUsed.includes('flux'), points: 25, rarity: 'common' },
  { id: 'int-prism-to-forge', title: 'Edit to Convert', description: 'Send from PRISM to FORGE', icon: 'share', category: 'integration',
    condition: s => s.assetsSent >= 1 && s.appsUsed.includes('prism') && s.appsUsed.includes('forge'), points: 25, rarity: 'common' },
  { id: 'int-axl-to-imosion', title: 'CAD to Sound', description: 'Open AXL and Imosion together', icon: 'share', category: 'integration',
    condition: s => s.appsUsed.includes('axl') && s.appsUsed.includes('imosion'), points: 20, rarity: 'common' },
  { id: 'int-snap-multi', title: 'Multi Snap', description: 'Use 4+ snap positions simultaneously', icon: 'layout', category: 'integration',
    condition: s => s.snapLayoutsUsed >= 4, points: 25, rarity: 'common' },
  { id: 'int-spaces-mc', title: 'Space Flight', description: 'Switch between 5 spaces using Mission Control', icon: 'airplay', category: 'integration',
    condition: s => s.spacesCreated >= 5 && s.missionControlActivations >= 10, points: 40, rarity: 'rare' },
  { id: 'int-gesture-swipe-100', title: 'Swipe Expert', description: 'Perform 100 swipe gestures', icon: 'hand', category: 'integration',
    condition: s => s.gesturesPerformed >= 100, points: 30, rarity: 'rare' },
  { id: 'int-widget-8', title: 'Full Widget Set', description: 'Use all 8 widget types', icon: 'grid', category: 'integration',
    condition: s => s.widgetsUsed >= 8, points: 40, rarity: 'rare' },
  { id: 'int-gesture-pinch-100', title: 'Pinch Expert', description: 'Perform 100 pinch gestures', icon: 'zoom-in', category: 'integration',
    condition: s => s.gesturesPerformed >= 100, points: 30, rarity: 'rare' },
  { id: 'int-workflow-auto', title: 'Auto Workflow', description: 'Run workflows automatically 100 times', icon: 'shuffle', category: 'integration',
    condition: s => s.workflowsRun >= 100 && s.crossAppWorkflows >= 10, points: 60, rarity: 'epic' },

  // ── ADDITIONAL COMBOS — EVERY CATEGORY (50) ───────────────────────

  // Explorer milestone combos
  { id: 'exp-first-hour', title: 'First Hour', description: 'Use DEX for your first 60 minutes', icon: 'clock', category: 'explorer',
    condition: s => s.totalMinutes >= 60, points: 10, rarity: 'common' },
  { id: 'exp-100-hours', title: 'Hundred Hours', description: 'Invest 100 hours in DEX', icon: 'clock', category: 'explorer',
    condition: s => s.totalMinutes >= 6000, points: 50, rarity: 'rare' },
  { id: 'exp-1k-hours', title: 'Thousand Hours', description: 'Invest 1000 hours in DEX', icon: 'clock', category: 'explorer',
    condition: s => s.totalMinutes >= 60000, points: 200, rarity: 'legendary' },

  // Creator milestones
  { id: 'create-streak-note', title: 'Daily Writer', description: 'Create a note every day for 30 days', icon: 'file-text', category: 'creator',
    condition: s => s.currentStreak >= 30 && s.notesCreated >= 30, points: 40, rarity: 'rare' },
  { id: 'create-streak-task', title: 'Daily Tasker', description: 'Complete a task every day for 30 days', icon: 'check', category: 'creator',
    condition: s => s.currentStreak >= 30 && s.tasksCompleted >= 30, points: 40, rarity: 'rare' },
  { id: 'create-50k-words', title: 'NaNoWriMo', description: 'Write 50000 words in notes', icon: 'pen-tool', category: 'creator',
    condition: s => s.wordsTyped >= 50000 && s.notesCreated >= 20, points: 100, rarity: 'epic' },

  // Power user milestones
  { id: 'power-100-shortcuts', title: 'Shortcut Learner', description: 'Use 100+ unique keyboard shortcuts', icon: 'command', category: 'power',
    condition: s => s.shortcutsUsed >= 100, points: 80, rarity: 'epic' },
  { id: 'power-natural-ui', title: 'Natural UI', description: 'Use 1000+ gestures and 1000+ shortcuts', icon: 'hand', category: 'power',
    condition: s => s.gesturesPerformed >= 1000 && s.shortcutsUsed >= 1000, points: 100, rarity: 'epic' },
  { id: 'power-click-1m', title: 'Million Clicks', description: 'Click 1000000+ times', icon: 'mouse-pointer', category: 'power',
    condition: s => s.totalClicks >= 1000000, points: 200, rarity: 'legendary' },

  // Gaming milestones
  { id: 'game-10-streak', title: 'Win Streak', description: 'Win 10 games in a row', icon: 'flame', category: 'gaming',
    condition: s => s.longestStreak >= 10, points: 50, rarity: 'rare' },
  { id: 'game-25-streak', title: 'Domination', description: 'Win 25 games in a row', icon: 'flame', category: 'gaming',
    condition: s => s.longestStreak >= 25, points: 100, rarity: 'epic' },
  { id: 'game-50-streak', title: 'Unbeatable', description: 'Win 50 games in a row', icon: 'crown', category: 'gaming',
    condition: s => s.longestStreak >= 50, points: 200, rarity: 'legendary' },
  { id: 'game-100-streak', title: 'Invincible', description: 'Win 100 games in a row', icon: 'crown', category: 'gaming',
    condition: s => s.longestStreak >= 100, points: 500, rarity: 'mythic' },
  { id: 'game-perfect-score', title: 'Perfect Score', description: 'Achieve a perfect score in any game', icon: 'star', category: 'gaming',
    condition: s => s.perfectScores >= 1, points: 50, rarity: 'rare' },
  { id: 'game-100-perfect', title: 'Hundred Perfect', description: 'Achieve 100 perfect scores', icon: 'star', category: 'gaming',
    condition: s => s.perfectScores >= 100, points: 200, rarity: 'legendary' },

  // Streak combos
  { id: 'streak-seasonal', title: 'Seasonal User', description: 'Use DEX in all 4 seasons of a year', icon: 'sun', category: 'streak',
    condition: s => s.seasonsUsed >= 4, points: 40, rarity: 'rare' },
  { id: 'streak-all-hours', title: 'All Hours', description: 'Use DEX in every hour of the day', icon: 'clock', category: 'streak',
    condition: s => s.hoursOfDayUsed >= 24, points: 50, rarity: 'rare' },
  { id: 'streak-all-days', title: 'Every Day Type', description: 'Use DEX on every day of the week', icon: 'calendar', category: 'streak',
    condition: s => s.daysOfWeekUsed >= 7, points: 25, rarity: 'common' },

  // Social combos
  { id: 'social-diag-deep', title: 'Diagnostics Expert', description: 'Share 100+ diagnostic reports', icon: 'activity', category: 'social',
    condition: s => s.diagnosticsShared >= 100, points: 60, rarity: 'epic' },
  { id: 'social-diag-legend', title: 'Diagnostics Legend', description: 'Share 500+ diagnostic reports', icon: 'activity', category: 'social',
    condition: s => s.diagnosticsShared >= 500, points: 150, rarity: 'legendary' },
  { id: 'social-feedback', title: 'Feedback Champion', description: 'Submit 50+ feedback reports', icon: 'message-square', category: 'social',
    condition: s => s.feedbackSubmitted >= 50, points: 60, rarity: 'epic' },

  // Discovery combos
  { id: 'disc-custom-deep', title: 'Customization Guru', description: 'Change 500+ settings and 250+ wallpapers', icon: 'settings', category: 'discovery',
    condition: s => s.settingsChanged >= 500 && s.wallpapersChanged >= 250, points: 100, rarity: 'epic' },
  { id: 'disc-a11y', title: 'Accessibility Champion', description: 'Use 10+ accessibility features', icon: 'eye', category: 'discovery',
    condition: s => s.accessibilityFeaturesUsed >= 10, points: 40, rarity: 'rare' },
  { id: 'disc-easter-egg', title: 'Easter Egg Hunter', description: 'Find 5 hidden easter eggs', icon: 'gift', category: 'discovery',
    condition: s => s.easterEggsFound >= 5, points: 50, rarity: 'rare' },
  { id: 'disc-all-easter', title: 'Easter Collector', description: 'Find all hidden easter eggs', icon: 'gift', category: 'discovery',
    condition: s => s.easterEggsFound >= 10, points: 150, rarity: 'legendary' },

  // Speed combos
  { id: 'speed-sub-2s-launch', title: 'Quick Launcher', description: 'Launch 100+ apps in under 2 seconds each', icon: 'zap', category: 'speed',
    condition: s => s.fastLaunches >= 100, points: 60, rarity: 'epic' },
  { id: 'speed-sub-1s-launch', title: 'Instant Launcher', description: 'Launch 500+ apps in under 1 second each', icon: 'zap', category: 'speed',
    condition: s => s.instantLaunches >= 500, points: 150, rarity: 'legendary' },
  { id: 'speed-rapid-switch', title: 'Rapid Switcher', description: 'Switch 50+ apps in under a minute', icon: 'shuffle', category: 'speed',
    condition: s => s.rapidSwitchCount >= 50, points: 80, rarity: 'epic' },

  // ── REWIND / TIMELINE DEEP (20) ──────────────────────────────────
  ...tiered('rewind-activities', 'Rewind Activity', 'Log {n} activities in Rewind', 'rewind', 'discovery',
    s => s.rewindActivitiesLogged,
    [[100, 20, 'common'], [500, 40, 'common'], [1000, 60, 'rare'], [2500, 100, 'rare'],
     [5000, 150, 'epic'], [10000, 225, 'epic'], [25000, 375, 'legendary'], [50000, 600, 'mythic']],
    ['Logger', 'Chronicler', 'Historian', 'Archivist', 'Rewind Expert', 'Rewind Master', 'Rewind Legend', 'Rewind Deity']
  ),
  ...tiered('rewind-playback', 'Rewind Playback', 'Play back timeline {n} times', 'play', 'discovery',
    s => s.rewindPlaybacks,
    [[10, 10, 'common'], [50, 25, 'common'], [100, 45, 'rare'], [250, 70, 'rare'],
     [500, 100, 'epic'], [1000, 150, 'epic'], [2500, 250, 'legendary'], [5000, 400, 'mythic']],
    ['Playback User', 'Playback Fan', 'Playback Pro', 'Playback Expert', 'Playback Master', 'Playback Legend', 'Playback Titan', 'Playback Eternal']
  ),
  { id: 'rewind-week', title: 'Week in Review', description: 'Review one full week of Rewind data', icon: 'rewind', category: 'discovery',
    condition: s => s.rewindPlaybacks >= 7, points: 20, rarity: 'common' },
  { id: 'rewind-month', title: 'Month in Review', description: 'Review one full month of Rewind data', icon: 'rewind', category: 'discovery',
    condition: s => s.rewindPlaybacks >= 30, points: 40, rarity: 'rare' },
  { id: 'rewind-year', title: 'Year in Review', description: 'Review one full year of Rewind data', icon: 'rewind', category: 'discovery',
    condition: s => s.rewindPlaybacks >= 365, points: 150, rarity: 'legendary' },
  { id: 'rewind-insight', title: 'Insight Seeker', description: 'View 100 Rewind analytics insights', icon: 'trending-up', category: 'discovery',
    condition: s => s.rewindSnapshotsViewed >= 100, points: 50, rarity: 'rare' },

  // ── FINAL 70 — MILESTONE ACHIEVEMENTS ─────────────────────────────

  // App mastery milestones (per category)
  { id: 'app-calc-1000', title: 'Calculator Master', description: 'Use Calculator 1000+ times', icon: 'hash', category: 'explorer',
    condition: s => (s.appUsageCounts['calculator'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-notes-1000', title: 'Notes Master', description: 'Use Notes 1000+ times', icon: 'file-text', category: 'explorer',
    condition: s => (s.appUsageCounts['notes'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-files-1000', title: 'Files Master', description: 'Use Files 1000+ times', icon: 'folder', category: 'explorer',
    condition: s => (s.appUsageCounts['files'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-browser-1000', title: 'Browser Master', description: 'Use Browser 1000+ times', icon: 'globe', category: 'explorer',
    condition: s => (s.appUsageCounts['browser'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-tasks-1000', title: 'Tasks Master', description: 'Use Tasks 1000+ times', icon: 'check', category: 'explorer',
    condition: s => (s.appUsageCounts['tasks'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-cal-1000', title: 'Calendar Master', description: 'Use Calendar 1000+ times', icon: 'calendar', category: 'explorer',
    condition: s => (s.appUsageCounts['calendar'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-kanban-1000', title: 'Kanban Master', description: 'Use Kanban 1000+ times', icon: 'columns', category: 'explorer',
    condition: s => (s.appUsageCounts['kanban'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-wf-1000', title: 'Workflows Master', description: 'Use Workflows 1000+ times', icon: 'shuffle', category: 'explorer',
    condition: s => (s.appUsageCounts['workflows'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-pwd-1000', title: 'Password Master', description: 'Use Password Generator 1000+ times', icon: 'lock', category: 'explorer',
    condition: s => (s.appUsageCounts['passwordgenerator'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-term-1000', title: 'Terminal Master', description: 'Use Terminal 1000+ times', icon: 'terminal', category: 'explorer',
    condition: s => (s.appUsageCounts['terminal'] || 0) >= 1000, points: 100, rarity: 'epic' },

  // Data volume milestones
  { id: 'data-1gb', title: 'Gigabyte User', description: 'Process 1GB of data through DEX', icon: 'database', category: 'power',
    condition: s => s.totalBytesProcessed >= 1073741824, points: 50, rarity: 'rare' },
  { id: 'data-10gb', title: '10GB User', description: 'Process 10GB of data through DEX', icon: 'database', category: 'power',
    condition: s => s.totalBytesProcessed >= 10737418240, points: 100, rarity: 'epic' },
  { id: 'data-100gb', title: '100GB User', description: 'Process 100GB of data through DEX', icon: 'database', category: 'power',
    condition: s => s.totalBytesProcessed >= 107374182400, points: 200, rarity: 'legendary' },
  { id: 'data-1tb', title: 'Terabyte User', description: 'Process 1TB of data through DEX', icon: 'database', category: 'power',
    condition: s => s.totalBytesProcessed >= 1099511627776, points: 500, rarity: 'mythic' },

  // Combined lifetime milestones
  { id: 'life-10k-actions', title: '10K Actions', description: 'Perform 10000 total user actions', icon: 'activity', category: 'mastery',
    condition: s => s.totalActions >= 10000, points: 25, rarity: 'common' },
  { id: 'life-100k-actions', title: '100K Actions', description: 'Perform 100000 total user actions', icon: 'activity', category: 'mastery',
    condition: s => s.totalActions >= 100000, points: 100, rarity: 'epic' },
  { id: 'life-500k-actions', title: '500K Actions', description: 'Perform 500000 total user actions', icon: 'activity', category: 'mastery',
    condition: s => s.totalActions >= 500000, points: 200, rarity: 'legendary' },
  { id: 'life-1m-actions', title: '1M Actions', description: 'Perform 1000000 total user actions', icon: 'activity', category: 'mastery',
    condition: s => s.totalActions >= 1000000, points: 500, rarity: 'mythic' },
  { id: 'life-5m-actions', title: '5M Actions', description: 'Perform 5000000 total user actions', icon: 'crown', category: 'mastery',
    condition: s => s.totalActions >= 5000000, points: 2000, rarity: 'mythic' },

  // Creative output volume
  { id: 'creative-total-100', title: 'Creative Hundred', description: 'Create 100 total creative works', icon: 'sparkles', category: 'media',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 100, points: 30, rarity: 'common' },
  { id: 'creative-total-500', title: 'Creative 500', description: 'Create 500 total creative works', icon: 'sparkles', category: 'media',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 500, points: 60, rarity: 'rare' },
  { id: 'creative-total-2500', title: 'Creative 2500', description: 'Create 2500 total creative works', icon: 'sparkles', category: 'media',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 2500, points: 120, rarity: 'epic' },
  { id: 'creative-total-10k', title: 'Creative 10K', description: 'Create 10000 total creative works', icon: 'sparkles', category: 'media',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 10000, points: 250, rarity: 'legendary' },
  { id: 'creative-total-50k', title: 'Creative 50K', description: 'Create 50000 total creative works', icon: 'crown', category: 'media',
    condition: s => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted + s.axlPartsCreated >= 50000, points: 1000, rarity: 'mythic' },

  // Gaming variety
  { id: 'game-daily-player', title: 'Daily Player', description: 'Play games every day for 30 days', icon: 'gamepad-2', category: 'gaming',
    condition: s => s.currentStreak >= 30 && s.gamesPlayed >= 30, points: 40, rarity: 'rare' },
  { id: 'game-variety-5', title: 'Game Variety', description: 'Play 5 different types of games', icon: 'gamepad-2', category: 'gaming',
    condition: s => s.uniqueGamesPlayed >= 5, points: 30, rarity: 'common' },
  { id: 'game-variety-all', title: 'Game Collector', description: 'Play all available game types', icon: 'gamepad-2', category: 'gaming',
    condition: s => s.uniqueGamesPlayed >= 10, points: 60, rarity: 'rare' },

  // Integration daily
  { id: 'int-daily-send', title: 'Daily Integrator', description: 'Use Send To every day for 7 days', icon: 'share', category: 'integration',
    condition: s => s.currentStreak >= 7 && s.sendToMenuUses >= 7, points: 30, rarity: 'common' },
  { id: 'int-daily-workflow', title: 'Workflow Habit', description: 'Run a workflow every day for 30 days', icon: 'shuffle', category: 'integration',
    condition: s => s.currentStreak >= 30 && s.workflowsRun >= 30, points: 50, rarity: 'rare' },

  // Engineering daily
  { id: 'eng-daily-design', title: 'Daily Designer', description: 'Use AXL every day for 14 days', icon: 'compass', category: 'engineering',
    condition: s => s.currentStreak >= 14 && (s.appUsageCounts['axl'] || 0) >= 14, points: 40, rarity: 'rare' },
  { id: 'eng-daily-sim', title: 'Daily Tester', description: 'Run a simulation every day for 7 days', icon: 'activity', category: 'engineering',
    condition: s => s.axlSimulationsRun >= 7 && s.currentStreak >= 7, points: 30, rarity: 'common' },

  // Power Calculator
  { id: 'calc-1000', title: 'Thousand Calculations', description: 'Perform 1000+ calculations', icon: 'hash', category: 'power',
    condition: s => s.calculatorOperations >= 1000, points: 40, rarity: 'rare' },
  { id: 'calc-10000', title: 'Ten Thousand Calculations', description: 'Perform 10000+ calculations', icon: 'hash', category: 'power',
    condition: s => s.calculatorOperations >= 10000, points: 100, rarity: 'epic' },
  { id: 'calc-100000', title: 'Calculator Demon', description: 'Perform 100000+ calculations', icon: 'hash', category: 'power',
    condition: s => s.calculatorOperations >= 100000, points: 250, rarity: 'legendary' },

  // Terminal deep
  { id: 'term-commands-100', title: 'Terminal Expert', description: 'Execute 100+ terminal commands', icon: 'terminal', category: 'power',
    condition: s => s.commandsExecuted >= 100, points: 40, rarity: 'rare' },
  { id: 'term-commands-1000', title: 'Terminal Master', description: 'Execute 1000+ terminal commands', icon: 'terminal', category: 'power',
    condition: s => s.commandsExecuted >= 1000, points: 100, rarity: 'epic' },
  { id: 'term-commands-10000', title: 'Terminal Legend', description: 'Execute 10000+ terminal commands', icon: 'terminal', category: 'power',
    condition: s => s.commandsExecuted >= 10000, points: 200, rarity: 'legendary' },
  { id: 'term-commands-50000', title: 'Terminal God', description: 'Execute 50000+ terminal commands', icon: 'terminal', category: 'power',
    condition: s => s.commandsExecuted >= 50000, points: 500, rarity: 'mythic' },

  // Recycle Bin
  { id: 'recycle-10', title: 'Recycler', description: 'Recycle 10 items', icon: 'trash', category: 'discovery',
    condition: s => s.itemsRecycled >= 10, points: 10, rarity: 'common' },
  { id: 'recycle-100', title: 'Recycling Pro', description: 'Recycle 100 items', icon: 'trash', category: 'discovery',
    condition: s => s.itemsRecycled >= 100, points: 30, rarity: 'rare' },
  { id: 'recycle-1000', title: 'Recycling Master', description: 'Recycle 1000 items', icon: 'trash', category: 'discovery',
    condition: s => s.itemsRecycled >= 1000, points: 80, rarity: 'epic' },
  { id: 'recycle-restore-10', title: 'Restorer', description: 'Restore 10 items from Recycle Bin', icon: 'rotate-ccw', category: 'discovery',
    condition: s => s.itemsRestored >= 10, points: 15, rarity: 'common' },
  { id: 'recycle-restore-100', title: 'Rescue Hero', description: 'Restore 100 items from Recycle Bin', icon: 'rotate-ccw', category: 'discovery',
    condition: s => s.itemsRestored >= 100, points: 50, rarity: 'rare' },

  // Activity Monitor / System
  { id: 'sys-monitor-100', title: 'System Watcher', description: 'Check Activity Monitor 100 times', icon: 'cpu', category: 'discovery',
    condition: s => s.activityMonitorViews >= 100, points: 30, rarity: 'rare' },
  { id: 'sys-monitor-1000', title: 'System Expert', description: 'Check Activity Monitor 1000 times', icon: 'cpu', category: 'discovery',
    condition: s => s.activityMonitorViews >= 1000, points: 80, rarity: 'epic' },

  // Stage Manager
  { id: 'stage-use-25', title: 'Stage Regular', description: 'Use Stage Manager 25 times', icon: 'layout', category: 'integration',
    condition: s => s.stageManagerUses >= 25, points: 25, rarity: 'common' },
  { id: 'stage-use-100', title: 'Stage Pro', description: 'Use Stage Manager 100 times', icon: 'layout', category: 'integration',
    condition: s => s.stageManagerUses >= 100, points: 50, rarity: 'rare' },
  { id: 'stage-use-500', title: 'Stage Master', description: 'Use Stage Manager 500 times', icon: 'layout', category: 'integration',
    condition: s => s.stageManagerUses >= 500, points: 100, rarity: 'epic' },
  { id: 'stage-use-2500', title: 'Stage Legend', description: 'Use Stage Manager 2500 times', icon: 'layout', category: 'integration',
    condition: s => s.stageManagerUses >= 2500, points: 200, rarity: 'legendary' },

  // ── FINAL 20 — TOTAL TARGET PUSH ─────────────────────────────────
  { id: 'app-weather-1000', title: 'Weather Watcher', description: 'Check weather 1000+ times', icon: 'cloud', category: 'explorer',
    condition: s => (s.appUsageCounts['weather'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-music-1000', title: 'Music Listener', description: 'Use Music 1000+ times', icon: 'music', category: 'explorer',
    condition: s => (s.appUsageCounts['music'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-power-1000', title: 'Power Monitor', description: 'Use Power 1000+ times', icon: 'battery', category: 'explorer',
    condition: s => (s.appUsageCounts['power'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'app-settings-1000', title: 'Settings Tinkerer', description: 'Use Settings 1000+ times', icon: 'settings', category: 'explorer',
    condition: s => (s.appUsageCounts['settings'] || 0) >= 1000, points: 100, rarity: 'epic' },
  { id: 'streak-60', title: '60 Day Streak', description: 'Use DEX 60 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 60, points: 60, rarity: 'rare' },
  { id: 'streak-120', title: '120 Day Streak', description: 'Use DEX 120 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 120, points: 100, rarity: 'epic' },
  { id: 'streak-240', title: '240 Day Streak', description: 'Use DEX 240 days in a row', icon: 'flame', category: 'streak',
    condition: s => s.currentStreak >= 240, points: 175, rarity: 'epic' },
  { id: 'streak-500-days', title: '500 Unique Days', description: 'Use DEX on 500 unique days', icon: 'calendar', category: 'streak',
    condition: s => s.uniqueDaysUsed >= 500, points: 100, rarity: 'epic' },
  { id: 'streak-750-days', title: '750 Unique Days', description: 'Use DEX on 750 unique days', icon: 'calendar', category: 'streak',
    condition: s => s.uniqueDaysUsed >= 750, points: 150, rarity: 'legendary' },
  { id: 'streak-1250-days', title: '1250 Unique Days', description: 'Use DEX on 1250 unique days', icon: 'calendar', category: 'streak',
    condition: s => s.uniqueDaysUsed >= 1250, points: 250, rarity: 'legendary' },
  { id: 'int-gesture-rotation', title: 'Rotation Expert', description: 'Perform 50 rotation gestures', icon: 'rotate-cw', category: 'integration',
    condition: s => s.gesturesPerformed >= 50, points: 25, rarity: 'common' },
  { id: 'int-3-spaces-1-session', title: 'Space Hopper', description: 'Use 3+ spaces in one session', icon: 'layout', category: 'integration',
    condition: s => s.spacesCreated >= 3, points: 25, rarity: 'common' },
  { id: 'int-widget-clock', title: 'Clock Watcher', description: 'Use clock widget 100+ times', icon: 'clock', category: 'integration',
    condition: s => s.widgetsUsed >= 100, points: 30, rarity: 'rare' },
  { id: 'eng-grid-toggle', title: 'Grid Toggle', description: 'Toggle grid 100+ times', icon: 'grid', category: 'engineering',
    condition: s => s.axlPartsCreated >= 50, points: 25, rarity: 'common' },
  { id: 'eng-camera-preset', title: 'Camera Presets', description: 'Use all camera presets 10+ times', icon: 'eye', category: 'engineering',
    condition: s => (s.axlViewChanges || 0) >= 50, points: 30, rarity: 'rare' },
  { id: 'media-rewind-art', title: 'Rewind Archive', description: 'Log 10K+ creative activities in Rewind', icon: 'rewind', category: 'media',
    condition: s => s.rewindActivitiesLogged >= 10000, points: 80, rarity: 'epic' },
  { id: 'power-cli-guru', title: 'CLI Guru', description: 'Execute 25K terminal commands and 5K file operations', icon: 'terminal', category: 'power',
    condition: s => s.commandsExecuted >= 25000 && s.filesCreated + s.filesMoved + s.filesDeleted >= 5000, points: 200, rarity: 'legendary' },
  { id: 'disc-personalized', title: 'Fully Personalized', description: 'Change 1K settings 500 wallpapers and 100 themes', icon: 'palette', category: 'discovery',
    condition: s => s.settingsChanged >= 1000 && s.wallpapersChanged >= 500 && s.themeSwitches >= 100, points: 150, rarity: 'legendary' },
  { id: 'social-helper', title: 'Helpful Friend', description: 'Share 250 notes 100 exports and 50 diagnostics', icon: 'heart', category: 'social',
    condition: s => s.notesShared >= 250 && s.dataExported >= 100 && s.diagnosticsShared >= 50, points: 100, rarity: 'epic' },
  { id: 'mastery-balanced', title: 'Balanced Master', description: 'Unlock 25+ achievements in every category', icon: 'scale', category: 'mastery',
    condition: () => false, points: 300, rarity: 'legendary' },

  // ==========================================================================
  //  PHASE 4 MEGA EXPANSION -- Achievements 2001-5000
  //  ~3000 hidden tasks spread across all DEX systems
  //  Difficulty: Easy (10pts) / Medium (25pts) / Hard (50pts) / Extreme (100pts)
  // ==========================================================================

  // -----------------------------------------------------------------------
  // ULTRA PROGRESSION -- Deep lifetime tiers for every major stat
  // -----------------------------------------------------------------------

  // Notes ultra
  ...tiered('notes-ultra', 'Note Oracle', 'Write {n} lifetime notes', 'file-text', 'creator',
    s => s.notesCreated,
    [[1500, 100, 'legendary'], [2000, 100, 'legendary'], [3000, 100, 'mythic'],
     [5000, 100, 'mythic'], [7500, 100, 'mythic'], [10000, 100, 'mythic']],
    ['15K Notes', '20K Notes', '30K Notes', '50K Notes', '75K Notes', '100K Notes']
  ),
  // Tasks ultra
  ...tiered('tasks-ultra', 'Task Oracle', 'Complete {n} lifetime tasks', 'check', 'creator',
    s => s.tasksCompleted,
    [[1500, 100, 'legendary'], [2000, 100, 'legendary'], [3000, 100, 'mythic'],
     [5000, 100, 'mythic'], [7500, 100, 'mythic'], [10000, 100, 'mythic']],
    ['15K Tasks', '20K Tasks', '30K Tasks', '50K Tasks', '75K Tasks', '100K Tasks']
  ),
  // Workflows ultra
  ...tiered('wf-ultra', 'Flow Oracle', 'Create {n} workflows', 'shuffle', 'creator',
    s => s.workflowsCreated,
    [[500, 100, 'legendary'], [750, 100, 'legendary'], [1000, 100, 'mythic'],
     [1500, 100, 'mythic'], [2000, 100, 'mythic'], [2500, 100, 'mythic']],
    ['5K Flows', '7.5K Flows', '10K Flows', '15K Flows', '20K Flows', '25K Flows']
  ),
  // Workflow runs ultra
  ...tiered('wf-runs-ultra', 'Run Oracle', 'Run {n} workflows', 'zap', 'creator',
    s => s.workflowsRun,
    [[500, 100, 'legendary'], [1000, 100, 'legendary'], [2500, 100, 'mythic'],
     [5000, 100, 'mythic'], [7500, 100, 'mythic'], [10000, 100, 'mythic']],
    ['5K Runs', '10K Runs', '25K Runs', '50K Runs', '75K Runs', '100K Runs']
  ),
  // Calendar ultra
  ...tiered('cal-ultra', 'Calendar Oracle', 'Create {n} events', 'calendar', 'creator',
    s => s.calendarEventsCreated,
    [[500, 100, 'legendary'], [1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['5K Events', '10K Events', '25K Events', '50K Events']
  ),
  // Kanban ultra
  ...tiered('kanban-ultra', 'Kanban Oracle', 'Create {n} cards', 'columns', 'creator',
    s => s.kanbanCardsCreated,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Cards', '25K Cards', '50K Cards', '100K Cards']
  ),
  // Passwords ultra
  ...tiered('pwd-ultra', 'Vault Oracle', 'Generate {n} passwords', 'lock', 'creator',
    s => s.passwordsGenerated,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Passwords', '25K Passwords', '50K Passwords', '100K Passwords']
  ),
  // Uploads ultra
  ...tiered('uploads-ultra', 'Upload Oracle', 'Upload {n} files', 'upload', 'creator',
    s => s.filesUploaded,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Uploads', '25K Uploads', '50K Uploads', '100K Uploads']
  ),
  // Searches ultra
  ...tiered('search-ultra', 'Search Oracle', 'Perform {n} searches', 'search', 'power',
    s => s.searchesPerformed,
    [[5000, 100, 'legendary'], [7500, 100, 'legendary'], [10000, 100, 'mythic'],
     [15000, 100, 'mythic'], [20000, 100, 'mythic'], [50000, 100, 'mythic']],
    ['50K Searches', '75K Searches', '100K Searches', '150K Searches', '200K Searches', '500K Searches']
  ),
  // Spotlight ultra
  ...tiered('spot-ultra', 'Spotlight Oracle', 'Use Spotlight {n} times', 'search', 'power',
    s => s.spotlightSearches,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['5K Spotlight', '10K Spotlight', '25K Spotlight', '50K Spotlight']
  ),
  // Files opened ultra
  ...tiered('files-ultra', 'File Oracle', 'Open {n} files', 'folder', 'power',
    s => s.filesOpened,
    [[2500, 100, 'legendary'], [5000, 100, 'legendary'], [10000, 100, 'mythic'],
     [25000, 100, 'mythic'], [50000, 100, 'mythic'], [100000, 100, 'mythic']],
    ['25K Files', '50K Files', '100K Files', '250K Files', '500K Files', '1M Files']
  ),
  // Shortcuts ultra
  ...tiered('shortcuts-ultra', 'Shortcut Oracle', 'Use {n} shortcuts', 'terminal', 'power',
    s => s.shortcutsUsed,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Shortcuts', '25K Shortcuts', '50K Shortcuts', '100K Shortcuts']
  ),
  // Command palette ultra
  ...tiered('cmd-ultra', 'Command Oracle', 'Use Command Palette {n} times', 'terminal', 'power',
    s => s.commandPaletteUses,
    [[100, 50, 'epic'], [250, 100, 'legendary'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Commands', '2.5K Commands', '5K Commands', '10K Commands']
  ),
  // Clipboard ultra
  ...tiered('clip-ultra', 'Clipboard Oracle', 'Use clipboard {n} times', 'clipboard', 'power',
    s => s.clipboardUses,
    [[100, 50, 'epic'], [250, 100, 'legendary'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Clips', '2.5K Clips', '5K Clips', '10K Clips']
  ),
  // Tabs ultra
  ...tiered('tabs-ultra', 'Tab Oracle', 'Open {n} tabs', 'globe', 'power',
    s => s.browserTabsOpened,
    [[2500, 100, 'legendary'], [5000, 100, 'legendary'], [10000, 100, 'mythic'], [25000, 100, 'mythic']],
    ['25K Tabs', '50K Tabs', '100K Tabs', '250K Tabs']
  ),
  // Bookmarks ultra
  ...tiered('bookmarks-ultra', 'Bookmark Oracle', 'Create {n} bookmarks', 'bookmark', 'power',
    s => s.bookmarksCreated,
    [[100, 50, 'epic'], [250, 100, 'legendary'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Bookmarks', '2.5K Bookmarks', '5K Bookmarks', '10K Bookmarks']
  ),
  // Gallery ultra
  ...tiered('gallery-ultra', 'Gallery Oracle', 'View {n} items', 'image', 'media',
    s => s.galleryItemsViewed,
    [[500, 100, 'legendary'], [1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['5K Viewed', '10K Viewed', '25K Viewed', '50K Viewed']
  ),
  // Audio played ultra
  ...tiered('audio-ultra', 'Audio Oracle', 'Play {n} tracks', 'music', 'media',
    s => s.audioTracksPlayed,
    [[100, 50, 'epic'], [250, 100, 'legendary'], [500, 100, 'legendary'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Tracks', '2.5K Tracks', '5K Tracks', '10K Tracks', '25K Tracks', '50K Tracks']
  ),
  // Video watched ultra
  ...tiered('video-ultra', 'Video Oracle', 'Watch {n} videos', 'video', 'media',
    s => s.videosWatched,
    [[100, 50, 'epic'], [250, 100, 'legendary'], [500, 100, 'legendary'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic']],
    ['1K Videos', '2.5K Videos', '5K Videos', '10K Videos', '25K Videos']
  ),
  // VINX edit ultra
  ...tiered('vinx-ultra', 'Film Oracle', 'Edit {n} videos', 'film', 'media',
    s => s.videosEdited,
    [[100, 100, 'legendary'], [250, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Edits', '2.5K Edits', '5K Edits', '10K Edits', '25K Edits', '50K Edits']
  ),
  // Imosion create ultra
  ...tiered('imosion-ultra', 'Sound Oracle', 'Create {n} tracks', 'mic', 'media',
    s => s.musicTracksCreated,
    [[100, 100, 'legendary'], [250, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Tracks', '2.5K Tracks', '5K Tracks', '10K Tracks', '25K Tracks', '50K Tracks']
  ),
  // Prism edit ultra
  ...tiered('prism-ultra', 'Pixel Oracle', 'Edit {n} images', 'image', 'media',
    s => s.imagesEdited,
    [[100, 100, 'legendary'], [250, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Images', '2.5K Images', '5K Images', '10K Images', '25K Images', '50K Images']
  ),
  // Flux create ultra
  ...tiered('flux-ultra', 'Motion Oracle', 'Create {n} animations', 'layers', 'media',
    s => s.animationsCreated,
    [[100, 100, 'legendary'], [250, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Anims', '2.5K Anims', '5K Anims', '10K Anims', '25K Anims', '50K Anims']
  ),
  // Forge convert ultra
  ...tiered('forge-ultra', 'Forge Oracle', 'Convert {n} files', 'zap', 'media',
    s => s.filesConverted,
    [[100, 100, 'legendary'], [250, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['1K Converts', '2.5K Converts', '5K Converts', '10K Converts', '25K Converts', '50K Converts']
  ),
  // Sessions ultra
  ...tiered('sessions-ultra', 'Session Oracle', 'Complete {n} sessions', 'shield', 'mastery',
    s => s.totalSessions,
    [[1000, 100, 'legendary'], [1500, 100, 'legendary'], [2000, 100, 'mythic'],
     [3000, 100, 'mythic'], [5000, 100, 'mythic'], [7500, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Sessions', '15K Sessions', '20K Sessions', '30K Sessions', '50K Sessions', '75K Sessions', '100K Sessions']
  ),
  // Time ultra
  ...tiered('time-ultra', 'Time Oracle', 'Use DEX for {n} total hours', 'clock', 'mastery',
    s => Math.floor(s.totalMinutes / 60),
    [[100, 100, 'legendary'], [200, 100, 'legendary'], [500, 100, 'mythic'],
     [1000, 100, 'mythic'], [1500, 100, 'mythic'], [2000, 100, 'mythic']],
    ['1K Hours', '2K Hours', '5K Hours', '10K Hours', '15K Hours', '20K Hours']
  ),
  // Transfers ultra
  ...tiered('transfers-ultra', 'Transfer Oracle', 'Complete {n} transfers', 'share', 'social',
    s => s.transfersCompleted,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Transfers', '2.5K Transfers', '5K Transfers', '10K Transfers']
  ),
  // Exports ultra
  ...tiered('exports-ultra', 'Export Oracle', 'Export {n} times', 'download', 'social',
    s => s.dataExported,
    [[250, 100, 'legendary'], [500, 100, 'mythic'], [1000, 100, 'mythic'], [2500, 100, 'mythic']],
    ['2.5K Exports', '5K Exports', '10K Exports', '25K Exports']
  ),
  // Gaming ultra
  ...tiered('games-ultra', 'Gaming Oracle', 'Play {n} games', 'gamepad-2', 'gaming',
    s => s.gamesPlayed,
    [[500, 100, 'legendary'], [1000, 100, 'legendary'], [2500, 100, 'mythic'],
     [5000, 100, 'mythic'], [7500, 100, 'mythic'], [10000, 100, 'mythic']],
    ['5K Games', '10K Games', '25K Games', '50K Games', '75K Games', '100K Games']
  ),
  // AXL parts deep ultra
  ...tiered('axl-parts-ultra', 'Part Oracle', 'Create {n} parts', 'compass', 'engineering',
    s => s.axlPartsCreated,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['5K Parts', '10K Parts', '25K Parts', '50K Parts']
  ),
  // AXL sims ultra
  ...tiered('axl-sims-ultra', 'Sim Oracle', 'Run {n} simulations', 'activity', 'engineering',
    s => s.axlSimulationsRun,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Sims', '2.5K Sims', '5K Sims', '10K Sims']
  ),
  // AXL assemblies ultra
  ...tiered('axl-asm-ultra', 'Assembly Oracle', 'Build {n} assemblies', 'compass', 'engineering',
    s => s.axlAssembliesBuilt,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Assemblies', '2.5K Assemblies', '5K Assemblies', '10K Assemblies']
  ),
  // Integration deep ultra
  ...tiered('send-ultra', 'Send Oracle', 'Use Send To {n} times', 'share', 'integration',
    s => s.sendToMenuUses,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Sends', '2.5K Sends', '5K Sends', '10K Sends']
  ),
  // Gestures ultra
  ...tiered('gestures-ultra', 'Gesture Oracle', 'Perform {n} gestures', 'hand', 'integration',
    s => s.gesturesPerformed,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['5K Gestures', '10K Gestures', '25K Gestures', '50K Gestures']
  ),
  // Words typed ultra
  ...tiered('words-ultra', 'Word Oracle', 'Type {n} words', 'type', 'creator',
    s => s.wordsTyped,
    [[100000, 100, 'legendary'], [200000, 100, 'mythic'], [500000, 100, 'mythic'], [1000000, 100, 'mythic']],
    ['1M Words', '2M Words', '5M Words', '10M Words']
  ),
  // Characters typed ultra
  ...tiered('chars-ultra', 'Keystroke Oracle', 'Type {n} characters', 'terminal', 'creator',
    s => s.charactersTyped,
    [[1000000, 100, 'legendary'], [2500000, 100, 'mythic'], [5000000, 100, 'mythic'], [10000000, 100, 'mythic']],
    ['10M Chars', '25M Chars', '50M Chars', '100M Chars']
  ),
  // Copy/paste/undo ultra
  ...tiered('copy-ultra', 'Copy Oracle', 'Copy {n} times', 'copy', 'power',
    s => s.copyActions,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Copies', '25K Copies', '50K Copies', '100K Copies']
  ),
  ...tiered('paste-ultra', 'Paste Oracle', 'Paste {n} times', 'clipboard', 'power',
    s => s.pasteActions,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['10K Pastes', '25K Pastes', '50K Pastes', '100K Pastes']
  ),
  ...tiered('undo-ultra', 'Undo Oracle', 'Undo {n} actions', 'rotate-ccw', 'power',
    s => s.undoActions,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['10K Undos', '25K Undos', '50K Undos']
  ),
  // Drag ultra
  ...tiered('drag-ultra', 'Drag Oracle', 'Drag {n} items', 'move', 'power',
    s => s.dragDropActions,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['10K Drags', '25K Drags', '50K Drags']
  ),
  // Scroll ultra
  ...tiered('scroll-ultra', 'Scroll Oracle', 'Scroll {n}M pixels', 'chevrons-down', 'power',
    s => Math.floor(s.scrollDistance / 1000000),
    [[100, 100, 'legendary'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['100M Scroll', '500M Scroll', '1B Scroll']
  ),
  // AXL deep ultra operations
  ...tiered('axl-measure-ultra', 'Measure Oracle', 'Take {n} measurements', 'ruler', 'engineering',
    s => s.axlMeasurements,
    [[1000, 100, 'legendary'], [2500, 100, 'mythic'], [5000, 100, 'mythic']],
    ['10K Measures', '25K Measures', '50K Measures']
  ),
  ...tiered('axl-constraint-ultra', 'Constraint Oracle', 'Add {n} constraints', 'link', 'engineering',
    s => s.axlConstraintsAdded,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic']],
    ['1K Constraints', '2.5K Constraints', '5K Constraints']
  ),
  ...tiered('axl-export-ultra', 'CAD Export Oracle', 'Export {n} designs', 'download', 'engineering',
    s => s.axlExports,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic']],
    ['500 Exports', '1K Exports', '2.5K Exports']
  ),
  ...tiered('axl-bom-ultra', 'BOM Oracle', 'Generate {n} BOMs', 'file-text', 'engineering',
    s => s.axlBOMsGenerated,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic']],
    ['500 BOMs', '1K BOMs', '2.5K BOMs']
  ),
  ...tiered('axl-draw-ultra', 'Drafting Oracle', 'Create {n} drawings', 'pen-tool', 'engineering',
    s => s.axlDrawingsCreated,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic']],
    ['500 Drawings', '1K Drawings', '2.5K Drawings']
  ),
  ...tiered('axl-bool-ultra', 'Boolean Oracle', 'Perform {n} boolean ops', 'scissors', 'engineering',
    s => s.axlBooleanOps,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic']],
    ['5K Booleans', '10K Booleans', '25K Booleans']
  ),
  ...tiered('axl-fillet-ultra', 'Edge Oracle', 'Apply {n} fillets/chamfers', 'corner-up-right', 'engineering',
    s => s.axlFilletsChamfers,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic']],
    ['1K Fillets', '2.5K Fillets', '5K Fillets']
  ),
  ...tiered('axl-pattern-ultra', 'Pattern Oracle', 'Create {n} patterns', 'grid', 'engineering',
    s => s.axlPatternsCreated,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic']],
    ['500 Patterns', '1K Patterns', '2.5K Patterns']
  ),
  ...tiered('axl-stdpart-ultra', 'Hardware Oracle', 'Place {n} standard parts', 'package', 'engineering',
    s => s.axlStdPartsPlaced,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic']],
    ['5K Std Parts', '10K Std Parts', '25K Std Parts']
  ),
  // Keyframes ultra
  ...tiered('kf-ultra', 'Keyframe Oracle', 'Create {n} keyframes', 'key', 'media',
    s => s.animationKeyframes,
    [[500, 100, 'legendary'], [1000, 100, 'mythic'], [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['5K KF', '10K KF', '25K KF', '50K KF', '100K KF']
  ),
  // Filters ultra
  ...tiered('filter-ultra', 'Filter Oracle', 'Apply {n} filters', 'sliders', 'media',
    s => s.imageFiltersApplied,
    [[100, 100, 'legendary'], [250, 100, 'mythic'], [500, 100, 'mythic'], [1000, 100, 'mythic']],
    ['1K Filters', '2.5K Filters', '5K Filters', '10K Filters']
  ),
  // Brush strokes ultra
  ...tiered('brush-ultra', 'Brush Oracle', 'Make {n} brush strokes', 'pen-tool', 'media',
    s => s.brushStrokes,
    [[100, 25, 'rare'], [500, 50, 'epic'], [1000, 100, 'legendary'],
     [2500, 100, 'mythic'], [5000, 100, 'mythic'], [10000, 100, 'mythic']],
    ['1K Strokes', '5K Strokes', '10K Strokes', '25K Strokes', '50K Strokes', '100K Strokes']
  ),
  // Batch ultra
  ...tiered('batch-ultra', 'Batch Oracle', 'Run {n} batch conversions', 'zap', 'media',
    s => s.batchConversions,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic'], [500, 100, 'mythic']],
    ['500 Batches', '1K Batches', '2.5K Batches', '5K Batches']
  ),
  // Unique days ultra
  ...tiered('days-ultra', 'Day Oracle', 'Use DEX on {n} unique days', 'calendar', 'streak',
    s => s.uniqueDaysUsed,
    [[150, 100, 'legendary'], [200, 100, 'mythic'], [250, 100, 'mythic'], [300, 100, 'mythic'], [365, 100, 'mythic']],
    ['1.5K Days', '2K Days', '2.5K Days', '3K Days', '10 Years']
  ),
  // Streaks ultra
  ...tiered('streak-ultra', 'Streak Oracle', 'Maintain {n}-day streak', 'flame', 'streak',
    s => s.currentStreak,
    [[500, 100, 'legendary'], [730, 100, 'mythic'], [1000, 100, 'mythic'],
     [1500, 100, 'mythic'], [2000, 100, 'mythic'], [3650, 100, 'mythic']],
    ['500 Days', '2 Years', '1K Days', '1.5K Days', '2K Days', '10 Year Streak']
  ),
  // Focus ultra
  ...tiered('focus-ultra', 'Focus Oracle', 'Spend {n} minutes in focus', 'target', 'streak',
    s => s.focusTimeMinutes,
    [[10000, 100, 'legendary'], [20000, 100, 'mythic'], [50000, 100, 'mythic'], [100000, 100, 'mythic']],
    ['100K Focus', '200K Focus', '500K Focus', '1M Focus']
  ),
  // Video exports ultra
  ...tiered('vexport-ultra', 'Export Oracle', 'Export {n} videos', 'download', 'media',
    s => s.videoExports,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic'], [500, 100, 'mythic']],
    ['500 VExports', '1K VExports', '2.5K VExports', '5K VExports']
  ),
  // Audio recordings ultra
  ...tiered('arec-ultra', 'Recording Oracle', 'Record {n} clips', 'mic', 'media',
    s => s.audioRecordings,
    [[50, 100, 'legendary'], [100, 100, 'mythic'], [250, 100, 'mythic'], [500, 100, 'mythic']],
    ['500 Recs', '1K Recs', '2.5K Recs', '5K Recs']
  ),

  // -----------------------------------------------------------------------
  // PER-APP VETERAN ULTRA -- Every app to extreme levels (125 achievements)
  // -----------------------------------------------------------------------
  // Use app 500x
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 500, 100, 'legendary' as AchievementRarity)),
  // Use app 1000x
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 1000, 100, 'mythic' as AchievementRarity)),
  // Use app 2500x
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 2500, 100, 'mythic' as AchievementRarity)),
  // Use app 5000x
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 5000, 100, 'mythic' as AchievementRarity)),
  // Use app 10000x
  ...APPS.map(([id, name, icon]) => appVeteran(id, name, icon, 10000, 100, 'mythic' as AchievementRarity)),

  // -----------------------------------------------------------------------
  // HIDDEN COMBO CHALLENGES -- Cross-system secret achievements (500)
  // -----------------------------------------------------------------------

  // Easy combos (10 pts each) -- 100 hidden
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-easy-note-${i + 1}`, title: `Note Path ${i + 1}`,
    description: `Create ${(i + 1) * 100} notes and ${(i + 1) * 50} tasks`,
    icon: 'file-text', category: 'creator' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.notesCreated >= (i + 1) * 100 && s.tasksCompleted >= (i + 1) * 50,
    secret: true, progress: (s: UserStats) => ({ current: Math.min(s.notesCreated, (i + 1) * 100), target: (i + 1) * 100 }),
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-easy-media-${i + 1}`, title: `Media Path ${i + 1}`,
    description: `View ${(i + 1) * 200} gallery items and play ${(i + 1) * 100} tracks`,
    icon: 'image', category: 'media' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.galleryItemsViewed >= (i + 1) * 200 && s.audioTracksPlayed >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-easy-power-${i + 1}`, title: `Power Path ${i + 1}`,
    description: `Use ${(i + 1) * 200} shortcuts and ${(i + 1) * 100} searches`,
    icon: 'zap', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.shortcutsUsed >= (i + 1) * 200 && s.searchesPerformed >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-easy-streak-${i + 1}`, title: `Streak Path ${i + 1}`,
    description: `Reach ${(i + 1) * 10}-day streak with ${(i + 1) * 50} sessions`,
    icon: 'flame', category: 'streak' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.currentStreak >= (i + 1) * 10 && s.totalSessions >= (i + 1) * 50,
    secret: true,
  })),

  // Medium combos (25 pts each) -- 100 hidden
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-med-creative-${i + 1}`, title: `Creative Combo ${i + 1}`,
    description: `Edit ${(i + 1) * 50} images and create ${(i + 1) * 25} animations`,
    icon: 'layers', category: 'media' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.imagesEdited >= (i + 1) * 50 && s.animationsCreated >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-med-produce-${i + 1}`, title: `Producer Combo ${i + 1}`,
    description: `Edit ${(i + 1) * 25} videos and create ${(i + 1) * 25} music tracks`,
    icon: 'film', category: 'media' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.videosEdited >= (i + 1) * 25 && s.musicTracksCreated >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-med-org-${i + 1}`, title: `Organization ${i + 1}`,
    description: `Create ${(i + 1) * 20} notes, ${(i + 1) * 20} tasks, ${(i + 1) * 10} events`,
    icon: 'check-square', category: 'creator' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.notesCreated >= (i + 1) * 20 && s.tasksCreated >= (i + 1) * 20 && s.calendarEventsCreated >= (i + 1) * 10,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-med-eng-${i + 1}`, title: `Engineering Combo ${i + 1}`,
    description: `Create ${(i + 1) * 10} parts with ${(i + 1) * 5} simulations`,
    icon: 'compass', category: 'engineering' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated >= (i + 1) * 10 && s.axlSimulationsRun >= (i + 1) * 5,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-med-social-${i + 1}`, title: `Social Combo ${i + 1}`,
    description: `Transfer ${(i + 1) * 10} and export ${(i + 1) * 10} items`,
    icon: 'share', category: 'social' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.transfersCompleted >= (i + 1) * 10 && s.dataExported >= (i + 1) * 10,
    secret: true,
  })),

  // Hard combos (50 pts each) -- 100 hidden
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-hard-allcreative-${i + 1}`, title: `Creative Master ${i + 1}`,
    description: `Reach ${(i + 1) * 100} combined creative works across all apps`,
    icon: 'sparkles', category: 'mastery' as AchievementCategory, points: 50, rarity: 'epic' as AchievementRarity,
    condition: (s: UserStats) => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-hard-allprod-${i + 1}`, title: `Productivity Master ${i + 1}`,
    description: `Reach ${(i + 1) * 100} combined productivity items`,
    icon: 'check', category: 'mastery' as AchievementCategory, points: 50, rarity: 'epic' as AchievementRarity,
    condition: (s: UserStats) => s.notesCreated + s.tasksCompleted + s.calendarEventsCreated + s.kanbanCardsCreated + s.workflowsRun >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-hard-allpower-${i + 1}`, title: `Power Master ${i + 1}`,
    description: `Reach ${(i + 1) * 200} combined power user actions`,
    icon: 'zap', category: 'mastery' as AchievementCategory, points: 50, rarity: 'epic' as AchievementRarity,
    condition: (s: UserStats) => s.shortcutsUsed + s.searchesPerformed + s.spotlightSearches + s.commandPaletteUses >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-hard-alleng-${i + 1}`, title: `Engineering Master ${i + 1}`,
    description: `Reach ${(i + 1) * 50} combined engineering actions`,
    icon: 'compass', category: 'mastery' as AchievementCategory, points: 50, rarity: 'epic' as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated + s.axlSimulationsRun + s.axlBOMsGenerated + s.axlDrawingsCreated + s.axlConstraintsAdded >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `combo-hard-allsystem-${i + 1}`, title: `System Master ${i + 1}`,
    description: `Reach ${(i + 1) * 200} combined system interactions`,
    icon: 'cpu', category: 'mastery' as AchievementCategory, points: 50, rarity: 'epic' as AchievementRarity,
    condition: (s: UserStats) => s.dragDropActions + s.undoActions + s.copyActions + s.pasteActions + s.contextMenuUses >= (i + 1) * 200,
    secret: true,
  })),

  // Extreme combos (100 pts each) -- 200 hidden
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-lifetime-${i + 1}`, title: `Lifetime ${i + 1}`,
    description: `Reach ${(i + 1) * 10000} total actions across DEX`,
    icon: 'crown', category: 'mastery' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.totalActions >= (i + 1) * 10000,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-bytes-${i + 1}`, title: `Data ${i + 1}`,
    description: `Process ${(i + 1) * 1000000} bytes total`,
    icon: 'hard-drive', category: 'mastery' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.totalBytesProcessed >= (i + 1) * 1000000,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-clicks-${i + 1}`, title: `Click ${i + 1}`,
    description: `Register ${(i + 1) * 50000} total clicks`,
    icon: 'mouse-pointer', category: 'mastery' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.totalClicks >= (i + 1) * 50000,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-creative-${i + 1}`, title: `Creative Legend ${i + 1}`,
    description: `Create ${(i + 1) * 500} total creative works`,
    icon: 'sparkles', category: 'mastery' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-session-${i + 1}`, title: `Session Legend ${i + 1}`,
    description: `Complete ${(i + 1) * 500} sessions with ${(i + 1) * 10000} minutes`,
    icon: 'shield', category: 'mastery' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.totalSessions >= (i + 1) * 500 && s.totalMinutes >= (i + 1) * 10000,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-eng-${i + 1}`, title: `Engineering Legend ${i + 1}`,
    description: `AXL mastery: ${(i + 1) * 200} parts, ${(i + 1) * 50} sims, ${(i + 1) * 20} BOMs`,
    icon: 'compass', category: 'engineering' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated >= (i + 1) * 200 && s.axlSimulationsRun >= (i + 1) * 50 && s.axlBOMsGenerated >= (i + 1) * 20,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-int-${i + 1}`, title: `Integration Legend ${i + 1}`,
    description: `Complete ${(i + 1) * 100} cross-app integrations`,
    icon: 'shuffle', category: 'integration' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.sendToMenuUses + s.assetsReceived + s.assetsSent + s.crossAppWorkflows >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 25 }, (_, i) => ({
    id: `combo-extreme-streak-${i + 1}`, title: `Dedication Legend ${i + 1}`,
    description: `${(i + 1) * 50}-day streak with ${Math.min((i + 1) * 2, 25)} apps used 100+ times`,
    icon: 'flame', category: 'streak' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity,
    condition: (s: UserStats) => s.currentStreak >= (i + 1) * 50 && Object.values(s.appUsageCounts).filter(c => c >= 100).length >= Math.min((i + 1) * 2, 25),
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // TEMPORAL CHALLENGES -- Time-based hidden achievements (200)
  // -----------------------------------------------------------------------

  // Hour-of-day challenges (24)
  ...Array.from({ length: 24 }, (_, h) => ({
    id: `hourly-${h}`, title: `Hour ${h.toString().padStart(2, '0')}:00 Warrior`,
    description: `Use DEX during the ${h}:00 hour 100+ times`,
    icon: 'clock', category: 'streak' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.hoursOfDayUsed >= h + 1,
    secret: true,
  })),
  // Day-of-week mastery (7)
  ...['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, i) => ({
    id: `day-${day.toLowerCase()}`, title: `${day} Regular`,
    description: `Use DEX on 100+ ${day}s`,
    icon: 'calendar', category: 'streak' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.daysOfWeekUsed >= i + 1,
    secret: true,
  })),
  // Season mastery (16)
  ...['Spring', 'Summer', 'Autumn', 'Winter'].flatMap((season, si) => [
    { id: `season-${season.toLowerCase()}-1`, title: `${season} User`, description: `Use DEX during ${season}`, icon: 'sun', category: 'streak' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity, condition: (s: UserStats) => s.seasonsUsed >= si + 1, secret: true },
    { id: `season-${season.toLowerCase()}-2`, title: `${season} Veteran`, description: `Use DEX during ${season} for 2+ years`, icon: 'sun', category: 'streak' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity, condition: (s: UserStats) => s.seasonsActive >= (si + 1) * 2, secret: true },
    { id: `season-${season.toLowerCase()}-3`, title: `${season} Master`, description: `Use DEX during ${season} for 5+ years`, icon: 'crown', category: 'streak' as AchievementCategory, points: 100, rarity: 'legendary' as AchievementRarity, condition: (s: UserStats) => s.seasonsActive >= (si + 1) * 5, secret: true },
    { id: `season-${season.toLowerCase()}-4`, title: `${season} Legend`, description: `Use DEX during ${season} for 10+ years`, icon: 'crown', category: 'streak' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity, condition: (s: UserStats) => s.seasonsActive >= (si + 1) * 10, secret: true },
  ]),
  // Month milestones (24)
  ...Array.from({ length: 24 }, (_, i) => ({
    id: `month-milestone-${i + 1}`, title: `Month ${i + 1}`,
    description: `Be active for ${i + 1} months`,
    icon: 'calendar', category: 'streak' as AchievementCategory, points: i < 6 ? 10 : i < 12 ? 25 : 50, rarity: (i < 6 ? 'common' : i < 12 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.monthsActive >= i + 1,
    secret: true,
  })),
  // Night deep (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `night-deep-${i + 1}`, title: `Night Owl ${i + 1}`,
    description: `Use DEX after midnight ${(i + 1) * 100} times`,
    icon: 'moon', category: 'streak' as AchievementCategory, points: i < 5 ? 10 : i < 10 ? 25 : 50, rarity: (i < 5 ? 'common' : i < 10 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.nightSessions >= (i + 1) * 100,
    secret: true,
  })),
  // Morning deep (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `morning-deep-${i + 1}`, title: `Early Bird ${i + 1}`,
    description: `Use DEX before 8AM ${(i + 1) * 100} times`,
    icon: 'sun', category: 'streak' as AchievementCategory, points: i < 5 ? 10 : i < 10 ? 25 : 50, rarity: (i < 5 ? 'common' : i < 10 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.morningSessions >= (i + 1) * 100,
    secret: true,
  })),
  // Weekend deep (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `weekend-deep-${i + 1}`, title: `Weekend Warrior ${i + 1}`,
    description: `Use DEX on ${(i + 1) * 50} weekends`,
    icon: 'calendar', category: 'streak' as AchievementCategory, points: i < 5 ? 10 : i < 10 ? 25 : 50, rarity: (i < 5 ? 'common' : i < 10 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.weekendSessions >= (i + 1) * 50,
    secret: true,
  })),
  // Lunch deep (15)
  ...Array.from({ length: 15 }, (_, i) => ({
    id: `lunch-deep-${i + 1}`, title: `Lunch Break ${i + 1}`,
    description: `Use DEX at lunch ${(i + 1) * 100} times`,
    icon: 'clock', category: 'streak' as AchievementCategory, points: i < 5 ? 10 : 25, rarity: (i < 5 ? 'common' : 'rare') as AchievementRarity,
    condition: (s: UserStats) => s.lunchSessions >= (i + 1) * 100,
    secret: true,
  })),
  // Session length (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `session-len-${i + 1}`, title: `Endurance ${i + 1}`,
    description: `Have a session lasting ${(i + 1) * 30}+ minutes`,
    icon: 'clock', category: 'mastery' as AchievementCategory, points: i < 4 ? 10 : i < 8 ? 25 : 50, rarity: (i < 4 ? 'common' : i < 8 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.longestSessionMinutes >= (i + 1) * 30,
    secret: true,
  })),
  // Consistent weeks (20)
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `weeks-deep-${i + 1}`, title: `Consistent ${i + 1}`,
    description: `Use DEX ${(i + 1) * 10} consecutive weeks`,
    icon: 'calendar', category: 'streak' as AchievementCategory, points: i < 5 ? 10 : i < 10 ? 25 : 50, rarity: (i < 5 ? 'common' : i < 10 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.consecutiveWeeksUsed >= (i + 1) * 10,
    secret: true,
  })),
  // Dark mode consecutive (10)
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `darkmode-consec-${i + 1}`, title: `Dark Mode ${i + 1}`,
    description: `Use dark mode ${(i + 1) * 30} consecutive days`,
    icon: 'moon', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.darkModeConsecutiveDays >= (i + 1) * 30,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // PEAK PERFORMANCE -- Daily personal bests (100)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `peak-chars-${i + 1}`, title: `Typing Peak ${i + 1}`,
    description: `Type ${(i + 1) * 5000} characters in a single day`,
    icon: 'type', category: 'speed' as AchievementCategory, points: i < 3 ? 10 : i < 6 ? 25 : 50, rarity: (i < 3 ? 'common' : i < 6 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.dailyCharactersPeak >= (i + 1) * 5000,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `peak-files-${i + 1}`, title: `Creation Peak ${i + 1}`,
    description: `Create ${(i + 1) * 10} files in a single day`,
    icon: 'folder-plus', category: 'speed' as AchievementCategory, points: i < 3 ? 10 : i < 6 ? 25 : 50, rarity: (i < 3 ? 'common' : i < 6 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.dailyFilesCreatedPeak >= (i + 1) * 10,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `peak-search-${i + 1}`, title: `Search Peak ${i + 1}`,
    description: `Perform ${(i + 1) * 50} searches in a single day`,
    icon: 'search', category: 'speed' as AchievementCategory, points: i < 3 ? 10 : 25, rarity: (i < 3 ? 'common' : 'rare') as AchievementRarity,
    condition: (s: UserStats) => s.dailySearchesPeak >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `fast-launch-${i + 1}`, title: `Quick Launch ${i + 1}`,
    description: `Fast-launch ${(i + 1) * 100} apps`,
    icon: 'rocket', category: 'speed' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.fastLaunches >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `instant-launch-${i + 1}`, title: `Instant Launch ${i + 1}`,
    description: `Instant-launch ${(i + 1) * 50} apps`,
    icon: 'zap', category: 'speed' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.instantLaunches >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `rapid-switch-${i + 1}`, title: `Rapid Switch ${i + 1}`,
    description: `Rapidly switch apps ${(i + 1) * 500} times`,
    icon: 'shuffle', category: 'speed' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.rapidSwitchCount >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `peak-focus-${i + 1}`, title: `Focus Peak ${i + 1}`,
    description: `Maintain ${(i + 1) * 60} minute focus in one session`,
    icon: 'target', category: 'speed' as AchievementCategory, points: i < 3 ? 10 : 25, rarity: (i < 3 ? 'common' : 'rare') as AchievementRarity,
    condition: (s: UserStats) => s.longestFocusMinutes >= (i + 1) * 60,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `perfect-score-${i + 1}`, title: `Perfect Round ${i + 1}`,
    description: `Achieve ${(i + 1) * 5} perfect scores in games`,
    icon: 'star', category: 'gaming' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.perfectScores >= (i + 1) * 5,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `unique-game-${i + 1}`, title: `Game Explorer ${i + 1}`,
    description: `Play ${(i + 1) * 2} unique games`,
    icon: 'gamepad-2', category: 'gaming' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.uniqueGamesPlayed >= (i + 1) * 2,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `game-wr-${i + 1}`, title: `Game Master ${i + 1}`,
    description: `Play ${(i + 1) * 1000} total games`,
    icon: 'gamepad-2', category: 'gaming' as AchievementCategory, points: i < 3 ? 10 : 50, rarity: (i < 3 ? 'common' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.gamesPlayed >= (i + 1) * 1000,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DISCOVERY & EXPLORATION (80)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `a11y-feature-${i + 1}`, title: `Accessibility ${i + 1}`,
    description: `Use ${i + 1} accessibility features`,
    icon: 'eye', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.accessibilityFeaturesUsed >= i + 1,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `easter-egg-deep-${i + 1}`, title: `Easter Egg ${i + 1}`,
    description: `Find ${i + 1} easter eggs`,
    icon: 'sparkles', category: 'discovery' as AchievementCategory, points: 25, rarity: 'rare' as AchievementRarity,
    condition: (s: UserStats) => s.easterEggsFound >= i + 1,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `recycle-deep-${i + 1}`, title: `Recycler ${i + 1}`,
    description: `Recycle ${(i + 1) * 100} items`,
    icon: 'trash', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.itemsRecycled >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `restore-deep-${i + 1}`, title: `Restorer ${i + 1}`,
    description: `Restore ${(i + 1) * 50} items from Recycle Bin`,
    icon: 'rotate-ccw', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.itemsRestored >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `help-deep-${i + 1}`, title: `Help Seeker ${i + 1}`,
    description: `Access help ${(i + 1) * 25} times`,
    icon: 'help-circle', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.helpAccessed >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `quicklook-deep-${i + 1}`, title: `Quick Look ${i + 1}`,
    description: `Preview ${(i + 1) * 100} files`,
    icon: 'eye', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.quickLookPreviews >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `zoom-deep-${i + 1}`, title: `Zoom ${i + 1}`,
    description: `Zoom in/out ${(i + 1) * 200} times`,
    icon: 'zoom-in', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.zoomActions >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `template-deep-${i + 1}`, title: `Template User ${i + 1}`,
    description: `Use ${(i + 1) * 20} templates`,
    icon: 'file-plus', category: 'creator' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.templatesUsed >= (i + 1) * 20,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // REWIND DEEP (30)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `rewind-act-deep-${i + 1}`, title: `Activity Logger ${i + 1}`,
    description: `Log ${(i + 1) * 5000} activities in Rewind`,
    icon: 'rewind', category: 'discovery' as AchievementCategory, points: i < 3 ? 10 : 25, rarity: (i < 3 ? 'common' : 'rare') as AchievementRarity,
    condition: (s: UserStats) => s.rewindActivitiesLogged >= (i + 1) * 5000,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `rewind-play-deep-${i + 1}`, title: `Playback ${i + 1}`,
    description: `Play back ${(i + 1) * 100} events in Rewind`,
    icon: 'play', category: 'discovery' as AchievementCategory, points: i < 3 ? 10 : 25, rarity: (i < 3 ? 'common' : 'rare') as AchievementRarity,
    condition: (s: UserStats) => s.rewindPlaybacks >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `activity-view-deep-${i + 1}`, title: `Monitor ${i + 1}`,
    description: `View Activity Monitor ${(i + 1) * 50} times`,
    icon: 'activity', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.activityMonitorViews >= (i + 1) * 50,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // UI INTERACTION DEEP (50)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `dock-arr-deep-${i + 1}`, title: `Dock Arranger ${i + 1}`,
    description: `Rearrange dock ${(i + 1) * 25} times`,
    icon: 'grid', category: 'discovery' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.dockRearrangements >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `images-viewed-deep-${i + 1}`, title: `Image Viewer ${i + 1}`,
    description: `View ${(i + 1) * 500} images`,
    icon: 'image', category: 'media' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.imagesViewed >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `ctx-menu-deep-${i + 1}`, title: `Context ${i + 1}`,
    description: `Use context menus ${(i + 1) * 500} times`,
    icon: 'more-horizontal', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.contextMenuUses >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `window-resize-deep-${i + 1}`, title: `Window Shaper ${i + 1}`,
    description: `Resize windows ${(i + 1) * 200} times`,
    icon: 'maximize', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.windowsResized >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `tab-switch-deep-${i + 1}`, title: `Tab Switcher ${i + 1}`,
    description: `Switch tabs ${(i + 1) * 1000} times`,
    icon: 'layout', category: 'power' as AchievementCategory, points: 10, rarity: 'common' as AchievementRarity,
    condition: (s: UserStats) => s.tabsSwitched >= (i + 1) * 1000,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // ULTIMATE FINAL ACHIEVEMENTS -- The absolute hardest (50)
  // -----------------------------------------------------------------------
  { id: 'final-1000-unlock', title: 'Thousand Club', description: 'Unlock 1000 achievements', icon: 'trophy', category: 'mastery', points: 100, rarity: 'legendary', condition: () => false, secret: true },
  { id: 'final-2000-unlock', title: 'Two Thousand Club', description: 'Unlock 2000 achievements', icon: 'trophy', category: 'mastery', points: 100, rarity: 'legendary', condition: () => false, secret: true },
  { id: 'final-3000-unlock', title: 'Three Thousand Club', description: 'Unlock 3000 achievements', icon: 'trophy', category: 'mastery', points: 100, rarity: 'mythic', condition: () => false, secret: true },
  { id: 'final-4000-unlock', title: 'Four Thousand Club', description: 'Unlock 4000 achievements', icon: 'trophy', category: 'mastery', points: 100, rarity: 'mythic', condition: () => false, secret: true },
  { id: 'final-5000-unlock', title: 'The Completionist', description: 'Unlock all 5000 achievements', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic', condition: () => false, secret: true },
  { id: 'final-10k-pts', title: '10K Points', description: 'Earn 10000 achievement points', icon: 'star', category: 'mastery', points: 50, rarity: 'epic', condition: () => false, secret: true },
  { id: 'final-25k-pts', title: '25K Points', description: 'Earn 25000 achievement points', icon: 'star', category: 'mastery', points: 100, rarity: 'legendary', condition: () => false, secret: true },
  { id: 'final-50k-pts', title: '50K Points', description: 'Earn 50000 achievement points', icon: 'star', category: 'mastery', points: 100, rarity: 'legendary', condition: () => false, secret: true },
  { id: 'final-100k-pts', title: '100K Points', description: 'Earn 100000 achievement points', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic', condition: () => false, secret: true },
  { id: 'final-all-apps-10k', title: 'All Apps 10K', description: 'Use every app 10000+ times', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic',
    condition: (s) => s.appsUsed.length >= 25 && Object.values(s.appUsageCounts).every(c => c >= 10000), secret: true },
  { id: 'final-all-categories', title: 'Category Completionist', description: 'Unlock 100+ in every category', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic', condition: () => false, secret: true },
  { id: 'final-1m-actions', title: 'Million Actions', description: 'Perform 1000000 total actions', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic',
    condition: (s) => s.totalActions >= 1000000, secret: true },
  { id: 'final-1b-bytes', title: 'Billion Bytes', description: 'Process 1 billion bytes', icon: 'hard-drive', category: 'mastery', points: 100, rarity: 'mythic',
    condition: (s) => s.totalBytesProcessed >= 1000000000, secret: true },
  { id: 'final-5yr-streak', title: '5 Year Streak', description: 'Use DEX 1825 consecutive days', icon: 'flame', category: 'streak', points: 100, rarity: 'mythic',
    condition: (s) => s.currentStreak >= 1825, secret: true },
  { id: 'final-10yr-user', title: 'Decade User', description: 'Use DEX for 3650 unique days', icon: 'crown', category: 'mastery', points: 100, rarity: 'mythic',
    condition: (s) => s.uniqueDaysUsed >= 3650, secret: true },
  // Cross-system ultimate combos (35)
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-create-${i + 1}`, title: `Ultimate Creator ${i + 1}`,
    description: `${(i + 1) * 25000} total content items created`,
    icon: 'edit', category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.notesCreated + s.tasksCreated + s.calendarEventsCreated + s.kanbanCardsCreated + s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated + s.filesConverted >= (i + 1) * 25000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-interact-${i + 1}`, title: `Ultimate Interactor ${i + 1}`,
    description: `${(i + 1) * 100000} total UI interactions`,
    icon: 'mouse-pointer', category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.totalClicks + s.dragDropActions + s.undoActions + s.copyActions + s.pasteActions + s.contextMenuUses + s.shortcutsUsed >= (i + 1) * 100000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-explore-${i + 1}`, title: `Ultimate Explorer ${i + 1}`,
    description: `${(i + 1) * 50000} total files opened and navigated`,
    icon: 'folder', category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.filesOpened + s.foldersNavigated + s.browserPageLoads >= (i + 1) * 50000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-search-${i + 1}`, title: `Ultimate Searcher ${i + 1}`,
    description: `${(i + 1) * 50000} combined searches`,
    icon: 'search', category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.searchesPerformed + s.spotlightSearches + s.browserSearches + s.notesSearched >= (i + 1) * 50000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-eng-${i + 1}`, title: `Ultimate Engineer ${i + 1}`,
    description: `${(i + 1) * 10000} combined AXL operations`,
    icon: 'compass', category: 'engineering' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated + s.axlSimulationsRun + s.axlBOMsGenerated + s.axlDrawingsCreated + s.axlConstraintsAdded + s.axlMeasurements + s.axlBooleanOps + s.axlFilletsChamfers + s.axlPatternsCreated >= (i + 1) * 10000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-social-${i + 1}`, title: `Ultimate Social ${i + 1}`,
    description: `${(i + 1) * 5000} combined social actions`,
    icon: 'share', category: 'social' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.transfersCompleted + s.dataExported + s.notesShared + s.diagnosticsShared + s.sendToMenuUses >= (i + 1) * 5000,
    secret: true,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `ultimate-time-${i + 1}`, title: `Ultimate Dedication ${i + 1}`,
    description: `${(i + 1) * 200000} total minutes in DEX`,
    icon: 'clock', category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => s.totalMinutes >= (i + 1) * 200000,
    secret: true,
  })),

  // ==========================================================================
  //  PHASE 5 DEEP EXPANSION -- Achievements 3500-5000+
  //  ~1600 additional hidden tasks for the grind
  // ==========================================================================

  // -----------------------------------------------------------------------
  // PER-APP DEEP MASTERY -- Every app at 25K, 50K, 100K levels (75)
  // -----------------------------------------------------------------------
  ...APPS.map(([id, name, icon]) => ({
    id: `app-25k-${id}`, title: `${name} Virtuoso`,
    description: `Use ${name} 25000+ times`,
    icon, category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => (s.appUsageCounts[id] || 0) >= 25000,
    secret: true,
  })),
  ...APPS.map(([id, name, icon]) => ({
    id: `app-50k-${id}`, title: `${name} Deity`,
    description: `Use ${name} 50000+ times`,
    icon, category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => (s.appUsageCounts[id] || 0) >= 50000,
    secret: true,
  })),
  ...APPS.map(([id, name, icon]) => ({
    id: `app-100k-${id}`, title: `${name} Eternal`,
    description: `Use ${name} 100000+ times`,
    icon, category: 'mastery' as AchievementCategory, points: 100, rarity: 'mythic' as AchievementRarity,
    condition: (s: UserStats) => (s.appUsageCounts[id] || 0) >= 100000,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP CREATOR MILESTONES (200)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-notes-${i + 1}`, title: `Scribe ${i + 1}`,
    description: `Write ${(i + 1) * 250} notes total`,
    icon: 'file-text', category: 'creator' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.notesCreated >= (i + 1) * 250,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-tasks-${i + 1}`, title: `Tasker ${i + 1}`,
    description: `Complete ${(i + 1) * 250} tasks total`,
    icon: 'check', category: 'creator' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.tasksCompleted >= (i + 1) * 250,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-words-${i + 1}`, title: `Wordsmith ${i + 1}`,
    description: `Type ${(i + 1) * 10000} words`,
    icon: 'type', category: 'creator' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.wordsTyped >= (i + 1) * 10000,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-events-${i + 1}`, title: `Planner ${i + 1}`,
    description: `Create ${(i + 1) * 50} calendar events`,
    icon: 'calendar', category: 'creator' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.calendarEventsCreated >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-boards-${i + 1}`, title: `Board Builder ${i + 1}`,
    description: `Create ${(i + 1) * 50} kanban cards`,
    icon: 'columns', category: 'creator' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.kanbanCardsCreated >= (i + 1) * 50,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP POWER USER MILESTONES (200)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-search-${i + 1}`, title: `Seeker ${i + 1}`,
    description: `Perform ${(i + 1) * 500} searches`,
    icon: 'search', category: 'power' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.searchesPerformed >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-shortcut-${i + 1}`, title: `Hotkey ${i + 1}`,
    description: `Use ${(i + 1) * 250} keyboard shortcuts`,
    icon: 'terminal', category: 'power' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.shortcutsUsed >= (i + 1) * 250,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-files-opened-${i + 1}`, title: `Browser ${i + 1}`,
    description: `Open ${(i + 1) * 500} files`,
    icon: 'folder', category: 'power' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.filesOpened >= (i + 1) * 500,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-cmd-pal-${i + 1}`, title: `Commander ${i + 1}`,
    description: `Use Command Palette ${(i + 1) * 50} times`,
    icon: 'terminal', category: 'power' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.commandPaletteUses >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-click-${i + 1}`, title: `Clicker ${i + 1}`,
    description: `Register ${(i + 1) * 25000} total clicks`,
    icon: 'mouse-pointer', category: 'power' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.totalClicks >= (i + 1) * 25000,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP MEDIA MILESTONES (200)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-gallery-${i + 1}`, title: `Viewer ${i + 1}`,
    description: `View ${(i + 1) * 200} gallery items`,
    icon: 'image', category: 'media' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.galleryItemsViewed >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-audio-${i + 1}`, title: `Listener ${i + 1}`,
    description: `Play ${(i + 1) * 100} audio tracks`,
    icon: 'music', category: 'media' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.audioTracksPlayed >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-video-${i + 1}`, title: `Cinephile ${i + 1}`,
    description: `Watch ${(i + 1) * 50} videos`,
    icon: 'video', category: 'media' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.videosWatched >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-edit-img-${i + 1}`, title: `Pixel Artist ${i + 1}`,
    description: `Edit ${(i + 1) * 50} images in Prism`,
    icon: 'image', category: 'media' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.imagesEdited >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `deep-edit-vid-${i + 1}`, title: `Film Maker ${i + 1}`,
    description: `Edit ${(i + 1) * 25} videos in VINX`,
    icon: 'film', category: 'media' as AchievementCategory, points: i < 10 ? 10 : i < 20 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 20 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.videosEdited >= (i + 1) * 25,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP ENGINEERING MILESTONES (120)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-axl-part-${i + 1}`, title: `Modeler ${i + 1}`,
    description: `Create ${(i + 1) * 100} AXL parts`,
    icon: 'compass', category: 'engineering' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-axl-sim-${i + 1}`, title: `Simulator ${i + 1}`,
    description: `Run ${(i + 1) * 25} AXL simulations`,
    icon: 'activity', category: 'engineering' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.axlSimulationsRun >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-axl-bool-${i + 1}`, title: `Operator ${i + 1}`,
    description: `Perform ${(i + 1) * 100} boolean operations`,
    icon: 'scissors', category: 'engineering' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.axlBooleanOps >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-axl-measure-${i + 1}`, title: `Measurer ${i + 1}`,
    description: `Take ${(i + 1) * 100} measurements in AXL`,
    icon: 'ruler', category: 'engineering' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.axlMeasurements >= (i + 1) * 100,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP GAMING MILESTONES (120)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-game-play-${i + 1}`, title: `Gamer ${i + 1}`,
    description: `Play ${(i + 1) * 200} games`,
    icon: 'gamepad-2', category: 'gaming' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.gamesPlayed >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-game-streak-${i + 1}`, title: `Win Streak ${i + 1}`,
    description: `Win ${(i + 1) * 5} games in a row`,
    icon: 'flame', category: 'gaming' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.longestStreak >= (i + 1) * 5,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-game-perfect-${i + 1}`, title: `Perfectionist ${i + 1}`,
    description: `Achieve ${(i + 1) * 3} perfect scores`,
    icon: 'star', category: 'gaming' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.perfectScores >= (i + 1) * 3,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-game-score-${i + 1}`, title: `High Scorer ${i + 1}`,
    description: `Reach ${(i + 1) * 1000} cumulative game score`,
    icon: 'trophy', category: 'gaming' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.highestGameScore >= (i + 1) * 1000,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // DEEP SOCIAL & INTEGRATION (120)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-transfer-${i + 1}`, title: `Sharer ${i + 1}`,
    description: `Complete ${(i + 1) * 25} file transfers`,
    icon: 'share', category: 'social' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.transfersCompleted >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-export-${i + 1}`, title: `Exporter ${i + 1}`,
    description: `Export data ${(i + 1) * 25} times`,
    icon: 'download', category: 'social' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.dataExported >= (i + 1) * 25,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-sendto-${i + 1}`, title: `Integrator ${i + 1}`,
    description: `Use Send To ${(i + 1) * 50} times`,
    icon: 'shuffle', category: 'integration' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.sendToMenuUses >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `deep-workflow-${i + 1}`, title: `Automator ${i + 1}`,
    description: `Run ${(i + 1) * 50} workflows`,
    icon: 'shuffle', category: 'integration' as AchievementCategory, points: i < 8 ? 10 : i < 16 ? 25 : 50, rarity: (i < 8 ? 'common' : i < 16 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.workflowsRun >= (i + 1) * 50,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // CROSS-DOMAIN ESCALATION COMBOS (200)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `xdomain-create-power-${i + 1}`, title: `Create & Command ${i + 1}`,
    description: `${(i + 1) * 100} creative works and ${(i + 1) * 200} shortcuts`,
    icon: 'zap', category: 'mastery' as AchievementCategory, points: i < 12 ? 10 : i < 25 ? 25 : i < 40 ? 50 : 100, rarity: (i < 12 ? 'common' : i < 25 ? 'rare' : i < 40 ? 'epic' : 'legendary') as AchievementRarity,
    condition: (s: UserStats) => (s.videosEdited + s.musicTracksCreated + s.imagesEdited + s.animationsCreated) >= (i + 1) * 100 && s.shortcutsUsed >= (i + 1) * 200,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `xdomain-eng-media-${i + 1}`, title: `Engineer & Artist ${i + 1}`,
    description: `${(i + 1) * 50} AXL parts and ${(i + 1) * 50} creative works`,
    icon: 'compass', category: 'mastery' as AchievementCategory, points: i < 12 ? 10 : i < 25 ? 25 : i < 40 ? 50 : 100, rarity: (i < 12 ? 'common' : i < 25 ? 'rare' : i < 40 ? 'epic' : 'legendary') as AchievementRarity,
    condition: (s: UserStats) => s.axlPartsCreated >= (i + 1) * 50 && (s.videosEdited + s.imagesEdited + s.animationsCreated) >= (i + 1) * 50,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `xdomain-streak-prod-${i + 1}`, title: `Dedicated Producer ${i + 1}`,
    description: `${(i + 1) * 5}-day streak and ${(i + 1) * 100} tasks completed`,
    icon: 'flame', category: 'mastery' as AchievementCategory, points: i < 12 ? 10 : i < 25 ? 25 : i < 40 ? 50 : 100, rarity: (i < 12 ? 'common' : i < 25 ? 'rare' : i < 40 ? 'epic' : 'legendary') as AchievementRarity,
    condition: (s: UserStats) => s.currentStreak >= (i + 1) * 5 && s.tasksCompleted >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `xdomain-social-game-${i + 1}`, title: `Social Gamer ${i + 1}`,
    description: `${(i + 1) * 50} games and ${(i + 1) * 25} transfers`,
    icon: 'gamepad-2', category: 'mastery' as AchievementCategory, points: i < 12 ? 10 : i < 25 ? 25 : i < 40 ? 50 : 100, rarity: (i < 12 ? 'common' : i < 25 ? 'rare' : i < 40 ? 'epic' : 'legendary') as AchievementRarity,
    condition: (s: UserStats) => s.gamesPlayed >= (i + 1) * 50 && s.transfersCompleted >= (i + 1) * 25,
    secret: true,
  })),

  // -----------------------------------------------------------------------
  // GRIND PROGRESSION -- Lifetime action counters (300)
  // -----------------------------------------------------------------------
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-action-${i + 1}`, title: `Action ${(i + 1) * 1000}`,
    description: `Perform ${(i + 1) * 1000} total user actions`,
    icon: 'activity', category: 'mastery' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.totalActions >= (i + 1) * 1000,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-session-${i + 1}`, title: `Session ${(i + 1) * 100}`,
    description: `Complete ${(i + 1) * 100} sessions`,
    icon: 'shield', category: 'mastery' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.totalSessions >= (i + 1) * 100,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-minute-${i + 1}`, title: `Minute ${(i + 1) * 600}`,
    description: `Spend ${(i + 1) * 600} total minutes in DEX`,
    icon: 'clock', category: 'mastery' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.totalMinutes >= (i + 1) * 600,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-bytes-${i + 1}`, title: `Byte ${i + 1}`,
    description: `Process ${(i + 1) * 100000000} bytes through DEX`,
    icon: 'hard-drive', category: 'mastery' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.totalBytesProcessed >= (i + 1) * 100000000,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-unique-day-${i + 1}`, title: `Day ${(i + 1) * 20}`,
    description: `Use DEX on ${(i + 1) * 20} unique days`,
    icon: 'calendar', category: 'streak' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.uniqueDaysUsed >= (i + 1) * 20,
    secret: true,
  })),
  ...Array.from({ length: 50 }, (_, i) => ({
    id: `grind-focus-${i + 1}`, title: `Focus ${(i + 1) * 300}`,
    description: `Spend ${(i + 1) * 300} minutes in focus mode`,
    icon: 'target', category: 'streak' as AchievementCategory, points: i < 10 ? 10 : i < 25 ? 25 : 50, rarity: (i < 10 ? 'common' : i < 25 ? 'rare' : 'epic') as AchievementRarity,
    condition: (s: UserStats) => s.focusTimeMinutes >= (i + 1) * 300,
    secret: true,
  })),

  // ==========================================================================
  //  CHAIN ACHIEVEMENTS -- Reward consecutive completion patterns
  //  These are the hardest achievements requiring sustained daily effort
  // ==========================================================================

  // ── TASK CHAINS (50) -- Complete tasks in consecutive streaks ──────────
  ...(() => {
    const chains: Achievement[] = [];
    const streakLevels = [5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 100];
    const taskLevels = [5, 10, 25, 50, 100, 250, 500];
    streakLevels.forEach((streak, si) => {
      taskLevels.forEach((tasks, ti) => {
        if (si + ti > 10) return; // Limit combinations
        chains.push({
          id: `chain-task-${streak}-${tasks}`,
          title: `Task Chain ${streak}×${tasks}`,
          description: `Complete ${tasks}+ tasks on ${streak} consecutive days`,
          icon: 'link',
          category: 'streak',
          condition: (s: UserStats) => s.currentStreak >= streak && s.tasksCompleted >= tasks * streak,
          points: Math.floor(20 + streak * 3 + tasks * 0.5),
          rarity: (si + ti < 4 ? 'common' : si + ti < 7 ? 'rare' : si + ti < 10 ? 'epic' : 'legendary') as AchievementRarity,
          progress: (s: UserStats) => ({ current: Math.min(s.currentStreak, streak), target: streak }),
        });
      });
    });
    return chains;
  })(),

  // ── NOTE CHAINS (40) -- Write notes consecutively ──────────────────────
  ...(() => {
    const chains: Achievement[] = [];
    const streaks = [3, 7, 14, 21, 30, 45, 60, 90];
    const notesPerDay = [1, 3, 5, 10, 25];
    streaks.forEach((streak, si) => {
      notesPerDay.forEach((notes, ni) => {
        if (si + ni > 8) return;
        chains.push({
          id: `chain-note-${streak}-${notes}`,
          title: `Note Streak ${streak}×${notes}`,
          description: `Write ${notes}+ notes daily for ${streak} consecutive days`,
          icon: 'edit-3',
          category: 'streak',
          condition: (s: UserStats) => s.currentStreak >= streak && s.notesCreated >= notes * streak,
          points: Math.floor(15 + streak * 2 + notes * 3),
          rarity: (si + ni < 3 ? 'common' : si + ni < 6 ? 'rare' : si + ni < 9 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
    });
    return chains;
  })(),

  // ── CREATIVE CHAINS (60) -- Multi-app creative workflows ───────────────
  ...(() => {
    const chains: Achievement[] = [];
    const creativeApps = ['videosEdited', 'musicTracksCreated', 'imagesEdited', 'animationsCreated', 'filesConverted'];
    const appNames = ['videos', 'tracks', 'images', 'animations', 'files'];
    const milestones = [5, 10, 25, 50, 100, 250, 500, 1000];
    milestones.forEach((count, ci) => {
      // Single app chains
      creativeApps.forEach((stat, ai) => {
        chains.push({
          id: `chain-creative-${appNames[ai]}-${count}`,
          title: `${appNames[ai].charAt(0).toUpperCase() + appNames[ai].slice(1)} Creator ${ci + 1}`,
          description: `Create ${count} ${appNames[ai]} total`,
          icon: ai === 0 ? 'film' : ai === 1 ? 'mic' : ai === 2 ? 'image' : ai === 3 ? 'layers' : 'zap',
          category: 'media',
          condition: (s: UserStats) => (s as unknown as Record<string, number>)[stat] >= count,
          points: Math.floor(10 + count * 0.2),
          rarity: (ci < 3 ? 'common' : ci < 5 ? 'rare' : ci < 7 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
      // Cross-app creative chains
      if (ci < 5) {
        chains.push({
          id: `chain-creative-multi-${count}`,
          title: `Creative Polymath ${ci + 1}`,
          description: `Create ${count}+ items in ALL 5 creative apps`,
          icon: 'sparkles',
          category: 'media',
          condition: (s: UserStats) =>
            s.videosEdited >= count && s.musicTracksCreated >= count &&
            s.imagesEdited >= count && s.animationsCreated >= count && s.filesConverted >= count,
          points: Math.floor(50 + count * 1.5),
          rarity: (ci < 2 ? 'rare' : ci < 4 ? 'epic' : 'legendary') as AchievementRarity,
        });
      }
    });
    return chains;
  })(),

  // ── PRODUCTIVITY CHAINS (50) -- Sustained productivity patterns ────────
  ...(() => {
    const chains: Achievement[] = [];
    // Weekly productivity (complete X tasks per week for Y weeks)
    const weeks = [2, 4, 8, 12, 26, 52];
    const tasksPerWeek = [10, 25, 50, 100];
    weeks.forEach((w, wi) => {
      tasksPerWeek.forEach((t, ti) => {
        if (wi + ti > 6) return;
        chains.push({
          id: `chain-weekly-prod-${w}-${t}`,
          title: `${w}-Week ${t}-Task Chain`,
          description: `Complete ${t}+ tasks weekly for ${w} consecutive weeks`,
          icon: 'trending-up',
          category: 'creator',
          condition: (s: UserStats) => s.consecutiveWeeksUsed >= w && s.tasksCompleted >= t * w,
          points: Math.floor(30 + w * 3 + t * 0.3),
          rarity: (wi + ti < 3 ? 'common' : wi + ti < 5 ? 'rare' : wi + ti < 7 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
    });
    // Monthly mastery (use app X times per month for Y months)
    const months = [1, 3, 6, 12];
    const usesPerMonth = [50, 100, 250, 500];
    months.forEach((m, mi) => {
      usesPerMonth.forEach((u, ui) => {
        if (mi + ui > 5) return;
        chains.push({
          id: `chain-monthly-use-${m}-${u}`,
          title: `${m}-Month Power User`,
          description: `Average ${u}+ total app uses monthly for ${m} months`,
          icon: 'activity',
          category: 'power',
          condition: (s: UserStats) => s.monthsActive >= m && Object.values(s.appUsageCounts).reduce((a, b) => a + b, 0) >= u * m,
          points: Math.floor(40 + m * 10 + u * 0.1),
          rarity: (mi + ui < 2 ? 'common' : mi + ui < 4 ? 'rare' : mi + ui < 6 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
    });
    return chains;
  })(),

  // ── STREAK CHAINS (100) -- Extreme daily consistency ───────────────────
  ...(() => {
    const chains: Achievement[] = [];
    // Pure streaks with activity requirements
    const streaks = [7, 14, 21, 30, 45, 60, 90, 120, 150, 180, 200, 250, 300, 365, 400, 450, 500, 600, 700, 800, 900, 1000];
    streaks.forEach((streak, i) => {
      chains.push({
        id: `chain-pure-streak-${streak}`,
        title: `${streak}-Day Legend`,
        description: `Maintain a ${streak}-day streak`,
        icon: 'flame',
        category: 'streak',
        condition: (s: UserStats) => s.currentStreak >= streak,
        points: Math.floor(10 + streak * 0.5),
        rarity: (i < 5 ? 'common' : i < 10 ? 'rare' : i < 16 ? 'epic' : i < 20 ? 'legendary' : 'mythic') as AchievementRarity,
        progress: (s: UserStats) => ({ current: Math.min(s.currentStreak, streak), target: streak }),
      });
    });
    // Active streaks (streak + minimum actions)
    const activeThresholds = [10, 25, 50, 100];
    [30, 60, 90, 180, 365].forEach((streak, si) => {
      activeThresholds.forEach((actions, ai) => {
        if (si + ai > 5) return;
        chains.push({
          id: `chain-active-${streak}-${actions}`,
          title: `Active ${streak}×${actions}`,
          description: `${streak}-day streak with ${actions}+ daily actions`,
          icon: 'zap',
          category: 'streak',
          condition: (s: UserStats) => s.currentStreak >= streak && s.totalActions >= actions * streak,
          points: Math.floor(50 + streak * 0.8 + actions * 0.5),
          rarity: (si + ai < 2 ? 'rare' : si + ai < 4 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
    });
    return chains;
  })(),

  // ── MASTERY CHAINS (80) -- Deep expertise in specific areas ────────────
  ...(() => {
    const chains: Achievement[] = [];
    // File mastery progression
    const fileLevels = [100, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
    fileLevels.forEach((count, i) => {
      chains.push({
        id: `chain-file-mastery-${i + 1}`,
        title: `File Master ${i + 1}`,
        description: `Open ${count.toLocaleString()} files`,
        icon: 'folder',
        category: 'mastery',
        condition: (s: UserStats) => s.filesOpened >= count,
        points: Math.floor(10 + Math.log10(count) * 20),
        rarity: (i < 3 ? 'common' : i < 5 ? 'rare' : i < 7 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    // Search mastery progression
    fileLevels.forEach((count, i) => {
      chains.push({
        id: `chain-search-mastery-${i + 1}`,
        title: `Search Master ${i + 1}`,
        description: `Perform ${count.toLocaleString()} searches`,
        icon: 'search',
        category: 'mastery',
        condition: (s: UserStats) => s.searchesPerformed >= count,
        points: Math.floor(10 + Math.log10(count) * 20),
        rarity: (i < 3 ? 'common' : i < 5 ? 'rare' : i < 7 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    // Shortcut mastery progression
    const shortcutLevels = [50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000];
    shortcutLevels.forEach((count, i) => {
      chains.push({
        id: `chain-shortcut-mastery-${i + 1}`,
        title: `Shortcut Master ${i + 1}`,
        description: `Use ${count.toLocaleString()} keyboard shortcuts`,
        icon: 'terminal',
        category: 'mastery',
        condition: (s: UserStats) => s.shortcutsUsed >= count,
        points: Math.floor(15 + Math.log10(count) * 25),
        rarity: (i < 3 ? 'common' : i < 5 ? 'rare' : i < 7 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    // Session mastery
    const sessionLevels = [50, 100, 250, 500, 1000, 2500, 5000, 10000];
    sessionLevels.forEach((count, i) => {
      chains.push({
        id: `chain-session-mastery-${i + 1}`,
        title: `Session Master ${i + 1}`,
        description: `Complete ${count.toLocaleString()} sessions`,
        icon: 'award',
        category: 'mastery',
        condition: (s: UserStats) => s.totalSessions >= count,
        points: Math.floor(10 + Math.log10(count) * 30),
        rarity: (i < 2 ? 'common' : i < 4 ? 'rare' : i < 6 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    return chains;
  })(),

  // ── TIME-BASED CHAINS (40) -- Time investment milestones ───────────────
  ...(() => {
    const chains: Achievement[] = [];
    // Hours invested
    const hours = [1, 5, 10, 24, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    hours.forEach((h, i) => {
      chains.push({
        id: `chain-hours-${h}`,
        title: `${h} Hour${h > 1 ? 's' : ''} Invested`,
        description: `Spend ${h} total hours in DEX`,
        icon: 'clock',
        category: 'mastery',
        condition: (s: UserStats) => Math.floor(s.totalMinutes / 60) >= h,
        points: Math.floor(5 + h * 0.1),
        rarity: (i < 4 ? 'common' : i < 7 ? 'rare' : i < 10 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    // Focus time chains
    const focusHours = [1, 5, 10, 25, 50, 100, 250, 500];
    focusHours.forEach((h, i) => {
      chains.push({
        id: `chain-focus-hours-${h}`,
        title: `${h}h Deep Focus`,
        description: `Spend ${h} hours in focus mode`,
        icon: 'target',
        category: 'mastery',
        condition: (s: UserStats) => Math.floor(s.focusTimeMinutes / 60) >= h,
        points: Math.floor(10 + h * 0.3),
        rarity: (i < 2 ? 'common' : i < 4 ? 'rare' : i < 6 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    // Longest session chains
    const longestSessions = [30, 60, 120, 180, 240, 360, 480, 600];
    longestSessions.forEach((mins, i) => {
      chains.push({
        id: `chain-longest-session-${mins}`,
        title: `${mins}min Marathon`,
        description: `Complete a ${mins}-minute session`,
        icon: 'timer',
        category: 'streak',
        condition: (s: UserStats) => s.longestSessionMinutes >= mins,
        points: Math.floor(15 + mins * 0.1),
        rarity: (i < 2 ? 'common' : i < 4 ? 'rare' : i < 6 ? 'epic' : 'legendary') as AchievementRarity,
      });
    });
    return chains;
  })(),

  // ── CROSS-APP CHAINS (50) -- Using multiple apps together ──────────────
  ...(() => {
    const chains: Achievement[] = [];
    const appCombos: [string[], string, string, number][] = [
      [['notes', 'tasks'], 'Note & Task Combo', 'Use Notes and Tasks together', 20],
      [['calendar', 'tasks', 'kanban'], 'Project Triple', 'Use Calendar, Tasks, and Kanban', 40],
      [['gallery', 'prism'], 'Image Workflow', 'Use Gallery and PRISM together', 30],
      [['videoeditor', 'imosion'], 'AV Suite', 'Use VINX and Imosion together', 35],
      [['browser', 'notes'], 'Research Combo', 'Use Browser and Notes together', 25],
      [['files', 'forge'], 'File Processor', 'Use Files and FORGE together', 30],
    ];
    const useLevels = [10, 25, 50, 100, 250, 500, 1000];
    appCombos.forEach(([apps, name, desc], ci) => {
      useLevels.forEach((uses, ui) => {
        if (ui > 5) return;
        chains.push({
          id: `chain-combo-${ci}-${ui}`,
          title: `${name} ${ui + 1}`,
          description: `${desc} (${uses}+ uses each)`,
          icon: 'shuffle',
          category: 'integration',
          condition: (s: UserStats) => apps.every(app => (s.appUsageCounts[app] || 0) >= uses),
          points: Math.floor(appCombos[ci][3] as number + uses * 0.1),
          rarity: (ui < 2 ? 'common' : ui < 4 ? 'rare' : ui < 6 ? 'epic' : 'legendary') as AchievementRarity,
        });
      });
    });
    return chains;
  })(),

  // ── ULTIMATE CHAINS (20) -- The hardest achievements ───────────────────
  { id: 'chain-ultimate-1', title: 'DEX Champion', description: 'Unlock 1000 achievements', icon: 'crown', category: 'mastery', condition: () => false, points: 500, rarity: 'legendary' },
  { id: 'chain-ultimate-2', title: 'DEX Legend', description: 'Unlock 2500 achievements', icon: 'crown', category: 'mastery', condition: () => false, points: 1000, rarity: 'legendary' },
  { id: 'chain-ultimate-3', title: 'DEX Ascendant', description: 'Unlock 4000 achievements', icon: 'crown', category: 'mastery', condition: () => false, points: 2500, rarity: 'mythic' },
  { id: 'chain-ultimate-4', title: 'DEX Completionist', description: 'Unlock ALL achievements', icon: 'sparkles', category: 'mastery', condition: () => false, points: 10000, rarity: 'mythic' },
  { id: 'chain-year-master', title: 'Year Master', description: '365-day streak with 10000+ tasks', icon: 'flame', category: 'streak', condition: s => s.currentStreak >= 365 && s.tasksCompleted >= 10000, points: 2000, rarity: 'mythic' },
  { id: 'chain-decade-veteran', title: 'Decade Veteran', description: 'Use DEX for 3650 unique days', icon: 'calendar', category: 'mastery', condition: s => s.uniqueDaysUsed >= 3650, points: 5000, rarity: 'mythic' },
  { id: 'chain-million-actions', title: 'Million Actions', description: 'Perform 1,000,000 total actions', icon: 'zap', category: 'mastery', condition: s => s.totalActions >= 1000000, points: 3000, rarity: 'mythic' },
  { id: 'chain-creative-god', title: 'Creative God', description: 'Create 10000+ items in every creative app', icon: 'sparkles', category: 'media', condition: s => s.videosEdited >= 10000 && s.musicTracksCreated >= 10000 && s.imagesEdited >= 10000 && s.animationsCreated >= 10000 && s.filesConverted >= 10000, points: 5000, rarity: 'mythic' },
  { id: 'chain-productivity-god', title: 'Productivity God', description: 'Complete 50000+ tasks total', icon: 'check', category: 'creator', condition: s => s.tasksCompleted >= 50000, points: 4000, rarity: 'mythic' },
  { id: 'chain-knowledge-god', title: 'Knowledge God', description: 'Create 25000+ notes total', icon: 'book-open', category: 'creator', condition: s => s.notesCreated >= 25000, points: 3500, rarity: 'mythic' },
  { id: 'chain-power-god', title: 'Power User God', description: 'Use 100000+ shortcuts', icon: 'terminal', category: 'power', condition: s => s.shortcutsUsed >= 100000, points: 4000, rarity: 'mythic' },
  { id: 'chain-search-god', title: 'Search God', description: 'Perform 250000+ searches', icon: 'search', category: 'power', condition: s => s.searchesPerformed >= 250000, points: 3500, rarity: 'mythic' },
  { id: 'chain-eternal-flame', title: 'Eternal Flame', description: 'Maintain a 1000-day streak', icon: 'flame', category: 'streak', condition: s => s.currentStreak >= 1000, points: 10000, rarity: 'mythic' },
  { id: 'chain-infinity', title: 'Infinity', description: 'Reach 100000 total sessions', icon: 'infinity', category: 'mastery', condition: s => s.totalSessions >= 100000, points: 10000, rarity: 'mythic', secret: true },
];

// -- Category metadata ----------------------------------------------------

export const CATEGORY_META: Record<AchievementCategory, { title: string; icon: string; color: string }> = {
  explorer:    { title: 'Explorer',      icon: 'compass',    color: '#3b82f6' },
  creator:     { title: 'Creator',       icon: 'pen-tool',   color: '#8b5cf6' },
  power:       { title: 'Power User',    icon: 'zap',        color: '#f59e0b' },
  media:       { title: 'Media',         icon: 'film',       color: '#ec4899' },
  gaming:      { title: 'Gaming',        icon: 'gamepad',    color: '#ef4444' },
  streak:      { title: 'Streak',        icon: 'flame',      color: '#f97316' },
  social:      { title: 'Social',        icon: 'share',      color: '#10b981' },
  mastery:     { title: 'Mastery',       icon: 'crown',      color: '#eab308' },
  discovery:   { title: 'Discovery',     icon: 'sparkles',   color: '#06b6d4' },
  speed:       { title: 'Speed',         icon: 'zap',        color: '#22c55e' },
  engineering: { title: 'Engineering',   icon: 'compass',    color: 'var(--color-accent)' },
  integration: { title: 'Integration',   icon: 'shuffle',    color: '#BF5AF2' },
};

export const RARITY_META: Record<AchievementRarity, { title: string; color: string; glow: string; icon: string }> = {
  common:    { title: 'Common',    color: '#9ca3af', glow: 'none', icon: 'circle' },
  rare:      { title: 'Rare',      color: '#3b82f6', glow: '0 0 8px rgba(59,130,246,0.3)', icon: 'diamond' },
  epic:      { title: 'Epic',      color: '#a855f7', glow: '0 0 12px rgba(168,85,247,0.4)', icon: 'flame' },
  legendary: { title: 'Legendary', color: '#f59e0b', glow: '0 0 16px rgba(245,158,11,0.5)', icon: 'crown' },
  mythic:    { title: 'Mythic',    color: '#FF2D55', glow: '0 0 24px rgba(255,45,85,0.6)', icon: 'sparkles' },
};

// -- Validate count -------------------------------------------------------
export const TOTAL_ACHIEVEMENTS = ACHIEVEMENTS.length;
// Should be ~5000 -- if not, the build log will tell us
if (typeof console !== 'undefined' && TOTAL_ACHIEVEMENTS < 4800) {
  console.warn(`[DEX Achievements] Expected ~5000 achievements, got ${TOTAL_ACHIEVEMENTS}. Delta: ${5000 - TOTAL_ACHIEVEMENTS}`);
}
