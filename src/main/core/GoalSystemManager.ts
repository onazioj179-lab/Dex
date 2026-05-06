// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
// ==========================================================================
// DEX - Goal System Manager (Feature 6)
// Weekly goal setting and tracking system with progress measurement.
// ==========================================================================

import { ipcMain, BrowserWindow } from 'electron';
import * as log from 'electron-log';
import { databaseManager } from './DatabaseManager';

export interface WeeklyGoal {
  id: number;
  week_start: string;
  goal_text: string;
  completion_pct: number;
  completed: number;
  created_at: number;
  updated_at: number;
}

export interface GoalProgressEntry {
  id: number;
  goal_id: number;
  date: string;
  note: string;
  created_at: number;
}

class GoalSystemManager {
  private mainWindow: BrowserWindow | null = null;

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.createTables();
    this.registerIPC();
    log.info('[GoalSystem] Goal system initialized');
  }

  private getDb(): any {
    return databaseManager.getDatabase();
  }

  private createTables(): void {
    const db = this.getDb();
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS weekly_goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        week_start TEXT NOT NULL UNIQUE,
        goal_text TEXT NOT NULL,
        completion_pct INTEGER DEFAULT 0,
        completed INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS goal_progress (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        goal_id INTEGER NOT NULL,
        date TEXT NOT NULL,
        note TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_weekly_goals_week ON weekly_goals(week_start);
      CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress(goal_id);
    `);
  }

  private getWeekStart(date?: Date): string {
    const d = date || new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().split('T')[0];
  }

  getCurrentGoal(): WeeklyGoal | null {
    const db = this.getDb();
    if (!db) return null;
    const weekStart = this.getWeekStart();
    return db.prepare('SELECT * FROM weekly_goals WHERE week_start = ?').get(weekStart) as WeeklyGoal | null;
  }

  needsGoalPrompt(): boolean {
    const now = new Date();
    if (now.getDay() !== 1) return false;
    return this.getCurrentGoal() === null;
  }

  setGoal(goalText: string): WeeklyGoal | null {
    const db = this.getDb();
    if (!db) return null;

    const weekStart = this.getWeekStart();
    const now = Date.now();

    db.prepare(
      `INSERT INTO weekly_goals (week_start, goal_text, completion_pct, completed, created_at, updated_at)
       VALUES (?, ?, 0, 0, ?, ?)
       ON CONFLICT(week_start) DO UPDATE SET goal_text = ?, updated_at = ?`
    ).run(weekStart, goalText, now, now, goalText, now);

    return this.getCurrentGoal();
  }

  updateProgress(completionPct: number): WeeklyGoal | null {
    const db = this.getDb();
    if (!db) return null;

    const weekStart = this.getWeekStart();
    const pct = Math.max(0, Math.min(100, completionPct));

    db.prepare(
      'UPDATE weekly_goals SET completion_pct = ?, updated_at = ? WHERE week_start = ?'
    ).run(pct, Date.now(), weekStart);

    return this.getCurrentGoal();
  }

  completeGoal(): WeeklyGoal | null {
    const db = this.getDb();
    if (!db) return null;

    const weekStart = this.getWeekStart();
    db.prepare(
      'UPDATE weekly_goals SET completed = 1, completion_pct = 100, updated_at = ? WHERE week_start = ?'
    ).run(Date.now(), weekStart);

    return this.getCurrentGoal();
  }

  addProgressNote(note: string): void {
    const db = this.getDb();
    if (!db) return;

    const goal = this.getCurrentGoal();
    if (!goal) return;

    const today = new Date().toISOString().split('T')[0];
    db.prepare(
      'INSERT INTO goal_progress (goal_id, date, note, created_at) VALUES (?, ?, ?, ?)'
    ).run(goal.id, today, note, Date.now());
  }

  getProgressEntries(goalId: number): GoalProgressEntry[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM goal_progress WHERE goal_id = ? ORDER BY date DESC'
    ).all(goalId) as GoalProgressEntry[];
  }

  getGoalHistory(): WeeklyGoal[] {
    const db = this.getDb();
    if (!db) return [];
    return db.prepare(
      'SELECT * FROM weekly_goals ORDER BY week_start DESC'
    ).all() as WeeklyGoal[];
  }

  autoComputeProgress(): void {
    const db = this.getDb();
    if (!db) return;

    const goal = this.getCurrentGoal();
    if (!goal || goal.completed) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      const weekStart = this.getWeekStart();

      let score = goal.completion_pct;

      const taskRow = db.prepare(
        "SELECT value FROM settings WHERE key = 'tasks_data'"
      ).get();
      if (taskRow) {
        try {
          const tasks = JSON.parse(taskRow.value);
          const completedThisWeek = Array.isArray(tasks) ? tasks.filter((t: any) =>
            t.status === 'completed' && t.completedAt && new Date(t.completedAt).toISOString().split('T')[0] >= weekStart
          ).length : 0;
          score = Math.min(100, score + completedThisWeek * 5);
        } catch { /* non-critical */ }
      }

      const todayNote = `Auto-tracked: progress updated to ${score}%`;
      this.addProgressNote(todayNote);
      this.updateProgress(score);
    } catch (err) {
      log.warn('[GoalSystem] Auto compute error:', err);
    }
  }

  private registerIPC(): void {
    ipcMain.handle('goal-system:getCurrentGoal', async () => {
      return this.getCurrentGoal();
    });

    ipcMain.handle('goal-system:needsPrompt', async () => {
      return this.needsGoalPrompt();
    });

    ipcMain.handle('goal-system:setGoal', async (_event, goalText: string) => {
      return this.setGoal(goalText);
    });

    ipcMain.handle('goal-system:updateProgress', async (_event, pct: number) => {
      return this.updateProgress(pct);
    });

    ipcMain.handle('goal-system:completeGoal', async () => {
      return this.completeGoal();
    });

    ipcMain.handle('goal-system:addProgressNote', async (_event, note: string) => {
      this.addProgressNote(note);
    });

    ipcMain.handle('goal-system:getProgressEntries', async (_event, goalId: number) => {
      return this.getProgressEntries(goalId);
    });

    ipcMain.handle('goal-system:getGoalHistory', async () => {
      return this.getGoalHistory();
    });

    ipcMain.handle('goal-system:autoCompute', async () => {
      this.autoComputeProgress();
    });
  }
}

export const goalSystemManager = new GoalSystemManager();
