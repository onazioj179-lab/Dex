/**
 * DEX Daily Challenges System
 * Gamified daily tasks to boost engagement and app mastery
 * Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
 */

// ============================================================================
// TYPES
// ============================================================================

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: 'productivity' | 'creative' | 'exploration' | 'speed' | 'mastery';
  xpReward: number;
  condition: ChallengeCondition;
  icon: string;
}

export interface ChallengeCondition {
  type: 'app_usage' | 'action_count' | 'streak' | 'time_spent' | 'discovery';
  target: string;
  threshold: number;
}

export interface DailyChallengeState {
  date: string; // YYYY-MM-DD
  challenges: ActiveChallenge[];
  completedToday: string[];
  totalXP: number;
  longestStreak: number;
  currentStreak: number;
  lastCompletionDate: string;
  history: { date: string; completed: number; xpEarned: number }[];
}

export interface ActiveChallenge extends Challenge {
  progress: number;
  completed: boolean;
  completedAt?: number;
}

// ============================================================================
// CHALLENGE TEMPLATES
// ============================================================================

const CHALLENGE_POOL: Challenge[] = [
  // Productivity
  { id: 'create-note', title: 'Quick Thinker', description: 'Create a new note in Notes', category: 'productivity', xpReward: 10, condition: { type: 'action_count', target: 'notes:create', threshold: 1 }, icon: 'notes' },
  { id: 'complete-task', title: 'Task Crusher', description: 'Complete 3 tasks in Tasks', category: 'productivity', xpReward: 20, condition: { type: 'action_count', target: 'tasks:complete', threshold: 3 }, icon: 'tasks' },
  { id: 'organize-files', title: 'File Organizer', description: 'Open Files and browse 5 folders', category: 'productivity', xpReward: 15, condition: { type: 'action_count', target: 'files:browse', threshold: 5 }, icon: 'files' },
  { id: 'use-calendar', title: 'Time Keeper', description: 'Check your Calendar today', category: 'productivity', xpReward: 10, condition: { type: 'app_usage', target: 'calendar', threshold: 1 }, icon: 'calendar' },
  { id: 'create-workflow', title: 'Automation Pro', description: 'Open Workflows and create a rule', category: 'productivity', xpReward: 25, condition: { type: 'action_count', target: 'workflows:create', threshold: 1 }, icon: 'workflows' },
  { id: 'kanban-card', title: 'Board Builder', description: 'Add 3 cards to your Kanban board', category: 'productivity', xpReward: 20, condition: { type: 'action_count', target: 'kanban:add_card', threshold: 3 }, icon: 'kanban' },

  // Creative
  { id: 'edit-video', title: 'Video Creator', description: 'Spend 5 minutes in VINX', category: 'creative', xpReward: 30, condition: { type: 'time_spent', target: 'videoeditor', threshold: 300 }, icon: 'videoeditor' },
  { id: 'edit-image', title: 'Pixel Perfect', description: 'Open PRISM and edit an image', category: 'creative', xpReward: 20, condition: { type: 'app_usage', target: 'prism', threshold: 1 }, icon: 'prism' },
  { id: 'make-music', title: 'Beat Maker', description: 'Spend 3 minutes in Imosion', category: 'creative', xpReward: 25, condition: { type: 'time_spent', target: 'imosion', threshold: 180 }, icon: 'imosion' },
  { id: 'motion-design', title: 'Motion Master', description: 'Open FLUX and create a composition', category: 'creative', xpReward: 25, condition: { type: 'app_usage', target: 'flux', threshold: 1 }, icon: 'flux' },
  { id: 'encode-media', title: 'Forge Ahead', description: 'Process a file in FORGE', category: 'creative', xpReward: 20, condition: { type: 'app_usage', target: 'forge', threshold: 1 }, icon: 'forge' },

  // Exploration
  { id: 'visit-3-apps', title: 'App Explorer', description: 'Open 3 different apps', category: 'exploration', xpReward: 15, condition: { type: 'action_count', target: 'app:launch', threshold: 3 }, icon: 'dashboard' },
  { id: 'visit-5-apps', title: 'Power User', description: 'Open 5 different apps in one session', category: 'exploration', xpReward: 25, condition: { type: 'action_count', target: 'app:launch', threshold: 5 }, icon: 'dashboard' },
  { id: 'browse-web', title: 'Web Surfer', description: 'Visit 3 pages in Browser', category: 'exploration', xpReward: 15, condition: { type: 'action_count', target: 'browser:navigate', threshold: 3 }, icon: 'browser' },
  { id: 'use-spotlight', title: 'Speed Searcher', description: 'Use Spotlight search 3 times', category: 'exploration', xpReward: 15, condition: { type: 'action_count', target: 'spotlight:search', threshold: 3 }, icon: 'search' },
  { id: 'use-settings', title: 'Customizer', description: 'Change a setting in Settings', category: 'exploration', xpReward: 10, condition: { type: 'app_usage', target: 'settings', threshold: 1 }, icon: 'settings' },

  // Speed
  { id: 'quick-launch', title: 'Speed Launcher', description: 'Launch an app using a keyboard shortcut', category: 'speed', xpReward: 15, condition: { type: 'action_count', target: 'shortcut:launch', threshold: 1 }, icon: 'keyboard' },
  { id: 'spotlight-master', title: 'Spotlight Pro', description: 'Find and launch 3 apps via Spotlight', category: 'speed', xpReward: 20, condition: { type: 'action_count', target: 'spotlight:launch', threshold: 3 }, icon: 'search' },
  { id: 'multitask', title: 'Multitasker', description: 'Have 3 apps running simultaneously', category: 'speed', xpReward: 20, condition: { type: 'action_count', target: 'app:concurrent', threshold: 3 }, icon: 'power' },

  // Mastery
  { id: 'streak-3', title: 'On a Roll', description: 'Complete challenges 3 days in a row', category: 'mastery', xpReward: 50, condition: { type: 'streak', target: 'daily', threshold: 3 }, icon: 'trophy' },
  { id: 'streak-7', title: 'Week Warrior', description: 'Complete challenges 7 days in a row', category: 'mastery', xpReward: 100, condition: { type: 'streak', target: 'daily', threshold: 7 }, icon: 'trophy' },
  { id: 'all-apps', title: 'DEX Master', description: 'Use every DEX app at least once', category: 'mastery', xpReward: 200, condition: { type: 'discovery', target: 'all_apps', threshold: 20 }, icon: 'star' },
];

// ============================================================================
// STORAGE
// ============================================================================

const STORAGE_KEY = 'dex-daily-challenges';

function getTodayKey(): string {
  return new Date().toISOString().split('T')[0];
}

export function loadChallenges(): DailyChallengeState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const state = JSON.parse(raw) as DailyChallengeState;
      // If challenges are from today, return as-is
      if (state.date === getTodayKey()) return state;
      // Otherwise generate new daily challenges
      return rollNewDay(state);
    }
  } catch (e) { console.warn('[DEX]', e); }
  return createInitialState();
}

export function saveChallenges(state: DailyChallengeState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { console.warn('[DEX]', e); }
}

function createInitialState(): DailyChallengeState {
  const state: DailyChallengeState = {
    date: getTodayKey(),
    challenges: [],
    completedToday: [],
    totalXP: 0,
    longestStreak: 0,
    currentStreak: 0,
    lastCompletionDate: '',
    history: [],
  };
  return rollNewDay(state);
}

export function rollNewDay(prev: DailyChallengeState): DailyChallengeState {
  const today = getTodayKey();

  // Archive yesterday's results
  const history = [...prev.history];
  if (prev.date !== today && prev.completedToday.length > 0) {
    history.push({
      date: prev.date,
      completed: prev.completedToday.length,
      xpEarned: prev.completedToday.reduce((sum, id) => {
        const ch = prev.challenges.find(c => c.id === id);
        return sum + (ch?.xpReward || 0);
      }, 0),
    });
  }

  // Update streak
  let currentStreak = prev.currentStreak;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split('T')[0];

  if (prev.lastCompletionDate === yesterdayKey && prev.completedToday.length > 0) {
    currentStreak = prev.currentStreak + 1;
  } else if (prev.lastCompletionDate !== today) {
    currentStreak = 0;
  }

  // Pick 3 random challenges from different categories
  const categories: Challenge['category'][] = ['productivity', 'creative', 'exploration', 'speed', 'mastery'];
  const shuffledCats = categories.sort(() => Math.random() - 0.5);
  const selected: Challenge[] = [];

  for (const cat of shuffledCats) {
    if (selected.length >= 3) break;
    const eligible = CHALLENGE_POOL.filter(c => c.category === cat && !selected.find(s => s.id === c.id));
    if (eligible.length > 0) {
      selected.push(eligible[Math.floor(Math.random() * eligible.length)]);
    }
  }

  // If still under 3, pad with any remaining
  while (selected.length < 3) {
    const remaining = CHALLENGE_POOL.filter(c => !selected.find(s => s.id === c.id));
    if (remaining.length === 0) break;
    selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
  }

  return {
    ...prev,
    date: today,
    challenges: selected.map(c => ({ ...c, progress: 0, completed: false })),
    completedToday: [],
    currentStreak,
    longestStreak: Math.max(prev.longestStreak, currentStreak),
    history: history.slice(-30), // Keep 30 days
  };
}

// ============================================================================
// PROGRESS TRACKING
// ============================================================================

export function recordChallengeProgress(
  state: DailyChallengeState,
  actionType: string,
  actionTarget: string,
  amount: number = 1
): { state: DailyChallengeState; newCompletions: ActiveChallenge[] } {
  const newCompletions: ActiveChallenge[] = [];
  const actionKey = `${actionType}:${actionTarget}`;

  const updatedChallenges = state.challenges.map(ch => {
    if (ch.completed) return ch;

    const condKey = `${ch.condition.type === 'app_usage' ? 'app_usage' : ch.condition.type}:${ch.condition.target}`;
    // Check if this action matches the challenge condition
    let matches = false;
    if (ch.condition.type === 'app_usage' && actionType === 'app_usage' && actionTarget === ch.condition.target) matches = true;
    if (ch.condition.type === 'action_count' && actionKey === ch.condition.target) matches = true;
    if (ch.condition.type === 'time_spent' && actionType === 'time_spent' && actionTarget === ch.condition.target) matches = true;
    if (ch.condition.type === 'streak' && actionType === 'streak') matches = true;
    if (ch.condition.type === 'discovery' && actionType === 'discovery') matches = true;

    if (!matches) return ch;

    const newProgress = Math.min(ch.progress + amount, ch.condition.threshold);
    const nowComplete = newProgress >= ch.condition.threshold;

    const updated = { ...ch, progress: newProgress, completed: nowComplete, completedAt: nowComplete ? Date.now() : undefined };
    if (nowComplete && !ch.completed) newCompletions.push(updated);
    return updated;
  });

  let totalXP = state.totalXP;
  const completedToday = [...state.completedToday];

  newCompletions.forEach(ch => {
    totalXP += ch.xpReward;
    completedToday.push(ch.id);
  });

  const lastCompletionDate = newCompletions.length > 0 ? getTodayKey() : state.lastCompletionDate;

  return {
    state: { ...state, challenges: updatedChallenges, totalXP, completedToday, lastCompletionDate },
    newCompletions,
  };
}

export function getChallengeLevel(xp: number): { level: number; title: string; nextLevelXP: number; progress: number } {
  const levels = [
    { threshold: 0, title: 'Beginner' },
    { threshold: 50, title: 'Apprentice' },
    { threshold: 150, title: 'Journeyman' },
    { threshold: 350, title: 'Expert' },
    { threshold: 700, title: 'Master' },
    { threshold: 1200, title: 'Grandmaster' },
    { threshold: 2000, title: 'Legend' },
    { threshold: 3500, title: 'Mythic' },
  ];

  let level = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].threshold) { level = i; break; }
  }

  const current = levels[level];
  const next = levels[Math.min(level + 1, levels.length - 1)];
  const progress = next.threshold > current.threshold
    ? (xp - current.threshold) / (next.threshold - current.threshold)
    : 1;

  return { level: level + 1, title: current.title, nextLevelXP: next.threshold, progress };
}

export { CHALLENGE_POOL };
