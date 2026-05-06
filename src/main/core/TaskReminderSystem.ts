// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ===========================================================================
// DEX - Task & Reminder System
// OS-Level task management with reminders, recurring tasks, and smart scheduling
// Keyboard-first, minimal UI, integrates with system notifications
// ===========================================================================

import { EventEmitter } from 'events';
import { app, ipcMain, Notification, BrowserWindow } from 'electron';
import * as fs from 'fs/promises';
import * as path from 'path';
import log from 'electron-log';

// ===========================================================================
// TYPES
// ===========================================================================

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'in-progress' | 'completed' | 'cancelled';
export type RecurrenceType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: number;
}

export interface Reminder {
  id: string;
  taskId: string;
  time: number;
  triggered: boolean;
  snoozedUntil?: number;
  message?: string;
}

export interface RecurrenceRule {
  type: RecurrenceType;
  interval: number; // Every N days/weeks/months
  daysOfWeek?: number[]; // 0-6 for weekly
  dayOfMonth?: number; // 1-31 for monthly
  endDate?: number;
  maxOccurrences?: number;
  occurrenceCount: number;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: number;
  updatedAt: number;
  dueDate?: number;
  dueTime?: string; // HH:mm format
  completedAt?: number;
  listId?: string;
  tags: string[];
  subtasks: Subtask[];
  reminders: Reminder[];
  recurrence?: RecurrenceRule;
  notes?: string;
  estimatedMinutes?: number;
  actualMinutes?: number;
  parentTaskId?: string;
}

export interface TaskList {
  id: string;
  name: string;
  color?: string;
  icon?: string;
  isDefault: boolean;
  taskCount: number;
  completedCount: number;
  createdAt: number;
}

export interface TaskFilter {
  status?: TaskStatus | TaskStatus[];
  priority?: TaskPriority | TaskPriority[];
  listId?: string;
  tags?: string[];
  dueBefore?: number;
  dueAfter?: number;
  search?: string;
  hasReminder?: boolean;
  isRecurring?: boolean;
  limit?: number;
}

export interface TasksConfig {
  defaultList: string;
  defaultReminderMinutes: number;
  autoCompleteSnoozedTasks: boolean;
  showOverdueTasks: boolean;
  weekStartsOn: number; // 0 = Sunday
  defaultView: 'list' | 'calendar' | 'kanban';
  notificationSound: boolean;
}

export interface TaskStats {
  totalTasks: number;
  pendingTasks: number;
  completedTasks: number;
  overdueTasks: number;
  todayTasks: number;
  thisWeekTasks: number;
  byPriority: Record<TaskPriority, number>;
  byList: Record<string, number>;
  completionRate: number;
  avgCompletionTime: number;
}

// ===========================================================================
// TASK & REMINDER SYSTEM
// ===========================================================================

class TaskReminderSystemClass extends EventEmitter {
  private tasks: Map<string, Task> = new Map();
  private lists: Map<string, TaskList> = new Map();
  private reminders: Map<string, Reminder> = new Map();
  private config: TasksConfig;
  private dataPath = '';
  private mainWindow: BrowserWindow | null = null;
  private idCounter = 0;
  private reminderCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.config = {
      defaultList: 'inbox',
      defaultReminderMinutes: 30,
      autoCompleteSnoozedTasks: false,
      showOverdueTasks: true,
      weekStartsOn: 0,
      defaultView: 'list',
      notificationSound: true,
    };
    this.setupIPC();
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------

  async initialize(mainWindow?: BrowserWindow): Promise<void> {
    this.mainWindow = mainWindow || null;
    this.dataPath = path.join(app.getPath('userData'), 'tasks');
    
    try {
      await fs.mkdir(this.dataPath, { recursive: true });
      await this.loadLists();
      await this.loadTasks();
      await this.loadConfig();
      
      // Create default list if none exists
      if (this.lists.size === 0) {
        await this.createList('Inbox', { isDefault: true });
      }
      
      // Start reminder checker
      this.startReminderChecker();
      
      log.info(`[Tasks] Initialized with ${this.tasks.size} tasks`);
    } catch (error) {
      log.error('[Tasks] Initialization failed:', error);
    }
  }

  // -------------------------------------------------------------------------
  // IPC SETUP
  // -------------------------------------------------------------------------

  private setupIPC(): void {
    // Task CRUD
    ipcMain.handle('tasks:create', async (_event, data: Partial<Task>) => {
      return this.createTask(data);
    });

    ipcMain.handle('tasks:get', (_event, id: string) => {
      return this.getTask(id);
    });

    ipcMain.handle('tasks:update', async (_event, id: string, data: Partial<Task>) => {
      return this.updateTask(id, data);
    });

    ipcMain.handle('tasks:delete', async (_event, id: string) => {
      return this.deleteTask(id);
    });

    ipcMain.handle('tasks:list', (_event, filter?: TaskFilter) => {
      return this.listTasks(filter);
    });

    // Quick actions
    ipcMain.handle('tasks:complete', async (_event, id: string) => {
      return this.completeTask(id);
    });

    ipcMain.handle('tasks:uncomplete', async (_event, id: string) => {
      return this.uncompleteTask(id);
    });

    ipcMain.handle('tasks:setPriority', async (_event, id: string, priority: TaskPriority) => {
      return this.setPriority(id, priority);
    });

    ipcMain.handle('tasks:setDueDate', async (_event, id: string, dueDate?: number) => {
      return this.setDueDate(id, dueDate);
    });

    // Subtasks
    ipcMain.handle('tasks:addSubtask', async (_event, taskId: string, title: string) => {
      return this.addSubtask(taskId, title);
    });

    ipcMain.handle('tasks:toggleSubtask', async (_event, taskId: string, subtaskId: string) => {
      return this.toggleSubtask(taskId, subtaskId);
    });

    ipcMain.handle('tasks:removeSubtask', async (_event, taskId: string, subtaskId: string) => {
      return this.removeSubtask(taskId, subtaskId);
    });

    // Reminders
    ipcMain.handle('tasks:addReminder', async (_event, taskId: string, time: number, message?: string) => {
      return this.addReminder(taskId, time, message);
    });

    ipcMain.handle('tasks:removeReminder', async (_event, reminderId: string) => {
      return this.removeReminder(reminderId);
    });

    ipcMain.handle('tasks:snoozeReminder', async (_event, reminderId: string, minutes: number) => {
      return this.snoozeReminder(reminderId, minutes);
    });

    // Lists
    ipcMain.handle('tasks:createList', async (_event, name: string, options?: Partial<TaskList>) => {
      return this.createList(name, options);
    });

    ipcMain.handle('tasks:getLists', () => {
      return this.getLists();
    });

    ipcMain.handle('tasks:updateList', async (_event, id: string, data: Partial<TaskList>) => {
      return this.updateList(id, data);
    });

    ipcMain.handle('tasks:deleteList', async (_event, id: string) => {
      return this.deleteList(id);
    });

    ipcMain.handle('tasks:moveToList', async (_event, taskId: string, listId: string) => {
      return this.moveToList(taskId, listId);
    });

    // Recurrence
    ipcMain.handle('tasks:setRecurrence', async (_event, taskId: string, rule?: RecurrenceRule) => {
      return this.setRecurrence(taskId, rule);
    });

    // Smart queries
    ipcMain.handle('tasks:today', () => this.getTodayTasks());
    ipcMain.handle('tasks:upcoming', (_event, days?: number) => this.getUpcomingTasks(days));
    ipcMain.handle('tasks:overdue', () => this.getOverdueTasks());
    ipcMain.handle('tasks:search', (_event, query: string) => this.searchTasks(query));

    // Stats
    ipcMain.handle('tasks:stats', () => this.getStats());

    // Tags
    ipcMain.handle('tasks:setTags', async (_event, id: string, tags: string[]) => {
      return this.setTags(id, tags);
    });

    ipcMain.handle('tasks:getAllTags', () => this.getAllTags());

    // Config
    ipcMain.handle('tasks:config', () => this.config);
    ipcMain.handle('tasks:setConfig', async (_event, config: Partial<TasksConfig>) => {
      return this.setConfig(config);
    });

    // Bulk operations
    ipcMain.handle('tasks:bulkComplete', async (_event, ids: string[]) => {
      return this.bulkComplete(ids);
    });

    ipcMain.handle('tasks:bulkDelete', async (_event, ids: string[]) => {
      return this.bulkDelete(ids);
    });
  }

  // -------------------------------------------------------------------------
  // TASK OPERATIONS
  // -------------------------------------------------------------------------

  async createTask(data: Partial<Task>): Promise<Task> {
    const now = Date.now();
    const id = `task-${++this.idCounter}-${now}`;

    const task: Task = {
      id,
      title: data.title || 'Untitled Task',
      description: data.description,
      status: 'pending',
      priority: data.priority || 'normal',
      createdAt: now,
      updatedAt: now,
      dueDate: data.dueDate,
      dueTime: data.dueTime,
      listId: data.listId || this.config.defaultList,
      tags: data.tags || [],
      subtasks: [],
      reminders: [],
      notes: data.notes,
      estimatedMinutes: data.estimatedMinutes,
      parentTaskId: data.parentTaskId,
    };

    // Auto-add reminder if due date set
    if (task.dueDate && this.config.defaultReminderMinutes > 0) {
      const reminderTime = task.dueDate - (this.config.defaultReminderMinutes * 60 * 1000);
      if (reminderTime > now) {
        task.reminders.push({
          id: `rem-${this.idCounter++}`,
          taskId: id,
          time: reminderTime,
          triggered: false,
        });
      }
    }

    this.tasks.set(id, task);
    await this.saveTask(task);
    this.updateListCounts(task.listId);

    this.emit('task:created', task);
    return task;
  }

  getTask(id: string): Task | null {
    return this.tasks.get(id) || null;
  }

  async updateTask(id: string, data: Partial<Task>): Promise<{ success: boolean; task?: Task }> {
    const task = this.tasks.get(id);
    if (!task) return { success: false };

    const oldListId = task.listId;

    // Update fields
    if (data.title !== undefined) task.title = data.title;
    if (data.description !== undefined) task.description = data.description;
    if (data.priority !== undefined) task.priority = data.priority;
    if (data.dueDate !== undefined) task.dueDate = data.dueDate;
    if (data.dueTime !== undefined) task.dueTime = data.dueTime;
    if (data.listId !== undefined) task.listId = data.listId;
    if (data.tags !== undefined) task.tags = data.tags;
    if (data.notes !== undefined) task.notes = data.notes;
    if (data.estimatedMinutes !== undefined) task.estimatedMinutes = data.estimatedMinutes;
    if (data.status !== undefined) task.status = data.status;

    task.updatedAt = Date.now();

    await this.saveTask(task);

    // Update list counts if moved
    if (oldListId !== task.listId) {
      this.updateListCounts(oldListId);
      this.updateListCounts(task.listId);
    }

    this.emit('task:updated', task);
    return { success: true, task };
  }

  async deleteTask(id: string): Promise<{ success: boolean }> {
    const task = this.tasks.get(id);
    if (!task) return { success: false };

    // Delete task file
    const taskPath = path.join(this.dataPath, `${id}.json`);
    await fs.unlink(taskPath).catch((e: unknown) => { log.warn('[DEX]', e); });

    // Remove reminders
    for (const reminder of task.reminders) {
      this.reminders.delete(reminder.id);
    }

    this.tasks.delete(id);
    this.updateListCounts(task.listId);

    this.emit('task:deleted', id);
    return { success: true };
  }

  listTasks(filter?: TaskFilter): Task[] {
    let tasks = Array.from(this.tasks.values());

    if (filter) {
      if (filter.status) {
        const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
        tasks = tasks.filter(t => statuses.includes(t.status));
      }

      if (filter.priority) {
        const priorities = Array.isArray(filter.priority) ? filter.priority : [filter.priority];
        tasks = tasks.filter(t => priorities.includes(t.priority));
      }

      if (filter.listId) {
        tasks = tasks.filter(t => t.listId === filter.listId);
      }

      if (filter.tags?.length) {
        tasks = tasks.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
      }

      if (filter.dueBefore) {
        tasks = tasks.filter(t => t.dueDate && t.dueDate <= filter.dueBefore!);
      }

      if (filter.dueAfter) {
        tasks = tasks.filter(t => t.dueDate && t.dueDate >= filter.dueAfter!);
      }

      if (filter.hasReminder !== undefined) {
        tasks = tasks.filter(t => (t.reminders.length > 0) === filter.hasReminder);
      }

      if (filter.isRecurring !== undefined) {
        tasks = tasks.filter(t => !!t.recurrence === filter.isRecurring);
      }

      if (filter.search) {
        const query = filter.search.toLowerCase();
        tasks = tasks.filter(t =>
          t.title.toLowerCase().includes(query) ||
          t.description?.toLowerCase().includes(query) ||
          t.tags.some(tag => tag.toLowerCase().includes(query))
        );
      }
    }

    // Sort by priority and due date
    tasks.sort((a, b) => {
      // Completed tasks at bottom
      if (a.status === 'completed' !== (b.status === 'completed')) {
        return a.status === 'completed' ? 1 : -1;
      }

      // Priority order
      const priorityOrder: Record<TaskPriority, number> = {
        urgent: 0,
        high: 1,
        normal: 2,
        low: 3,
      };
      
      if (a.priority !== b.priority) {
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      }

      // Due date (earlier first, no date at end)
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;

      return b.createdAt - a.createdAt;
    });

    if (filter?.limit) {
      tasks = tasks.slice(0, filter.limit);
    }

    return tasks;
  }

  // -------------------------------------------------------------------------
  // QUICK ACTIONS
  // -------------------------------------------------------------------------

  async completeTask(id: string): Promise<{ success: boolean }> {
    const task = this.tasks.get(id);
    if (!task) return { success: false };

    task.status = 'completed';
    task.completedAt = Date.now();
    task.updatedAt = Date.now();

    // Mark all subtasks as completed
    for (const subtask of task.subtasks) {
      if (!subtask.completed) {
        subtask.completed = true;
        subtask.completedAt = Date.now();
      }
    }

    await this.saveTask(task);
    this.updateListCounts(task.listId);

    // Handle recurrence
    if (task.recurrence) {
      await this.createNextRecurrence(task);
    }

    this.emit('task:completed', task);
    return { success: true };
  }

  async uncompleteTask(id: string): Promise<{ success: boolean }> {
    const task = this.tasks.get(id);
    if (!task) return { success: false };

    task.status = 'pending';
    task.completedAt = undefined;
    task.updatedAt = Date.now();

    await this.saveTask(task);
    this.updateListCounts(task.listId);

    this.emit('task:uncompleted', task);
    return { success: true };
  }

  async setPriority(id: string, priority: TaskPriority): Promise<{ success: boolean }> {
    return this.updateTask(id, { priority });
  }

  async setDueDate(id: string, dueDate?: number): Promise<{ success: boolean }> {
    return this.updateTask(id, { dueDate });
  }

  async setTags(id: string, tags: string[]): Promise<{ success: boolean }> {
    return this.updateTask(id, { tags });
  }

  // -------------------------------------------------------------------------
  // SUBTASKS
  // -------------------------------------------------------------------------

  async addSubtask(taskId: string, title: string): Promise<{ success: boolean; subtask?: Subtask }> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false };

    const subtask: Subtask = {
      id: `sub-${this.idCounter++}`,
      title,
      completed: false,
    };

    task.subtasks.push(subtask);
    task.updatedAt = Date.now();
    await this.saveTask(task);

    this.emit('task:updated', task);
    return { success: true, subtask };
  }

  async toggleSubtask(taskId: string, subtaskId: string): Promise<{ success: boolean }> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false };

    const subtask = task.subtasks.find(s => s.id === subtaskId);
    if (!subtask) return { success: false };

    subtask.completed = !subtask.completed;
    subtask.completedAt = subtask.completed ? Date.now() : undefined;
    task.updatedAt = Date.now();

    await this.saveTask(task);
    this.emit('task:updated', task);
    return { success: true };
  }

  async removeSubtask(taskId: string, subtaskId: string): Promise<{ success: boolean }> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false };

    const index = task.subtasks.findIndex(s => s.id === subtaskId);
    if (index === -1) return { success: false };

    task.subtasks.splice(index, 1);
    task.updatedAt = Date.now();

    await this.saveTask(task);
    this.emit('task:updated', task);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // REMINDERS
  // -------------------------------------------------------------------------

  private startReminderChecker(): void {
    // Check reminders every minute
    this.reminderCheckInterval = setInterval(() => {
      this.checkReminders();
    }, 60000);

    // Initial check
    this.checkReminders();
  }

  private checkReminders(): void {
    const now = Date.now();

    for (const task of this.tasks.values()) {
      for (const reminder of task.reminders) {
        if (reminder.triggered) continue;

        const reminderTime = reminder.snoozedUntil || reminder.time;
        if (reminderTime <= now) {
          this.triggerReminder(task, reminder);
        }
      }
    }
  }

  private triggerReminder(task: Task, reminder: Reminder): void {
    reminder.triggered = true;

    // Show system notification
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Task Reminder',
        body: reminder.message || task.title,
        urgency: task.priority === 'urgent' ? 'critical' : 'normal',
        silent: !this.config.notificationSound,
      });

      notification.on('click', () => {
        this.notifyRenderer('task:focus', task.id);
      });

      notification.show();
    }

    // Notify renderer
    this.notifyRenderer('reminder:triggered', { task, reminder });
    this.emit('reminder:triggered', { task, reminder });

    this.saveTask(task);
  }

  async addReminder(taskId: string, time: number, message?: string): Promise<{ success: boolean; reminder?: Reminder }> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false };

    const reminder: Reminder = {
      id: `rem-${this.idCounter++}`,
      taskId,
      time,
      triggered: false,
      message,
    };

    task.reminders.push(reminder);
    this.reminders.set(reminder.id, reminder);
    task.updatedAt = Date.now();

    await this.saveTask(task);
    this.emit('reminder:added', reminder);

    return { success: true, reminder };
  }

  async removeReminder(reminderId: string): Promise<{ success: boolean }> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return { success: false };

    const task = this.tasks.get(reminder.taskId);
    if (task) {
      const index = task.reminders.findIndex(r => r.id === reminderId);
      if (index > -1) {
        task.reminders.splice(index, 1);
        task.updatedAt = Date.now();
        await this.saveTask(task);
      }
    }

    this.reminders.delete(reminderId);
    return { success: true };
  }

  async snoozeReminder(reminderId: string, minutes: number): Promise<{ success: boolean }> {
    const reminder = this.reminders.get(reminderId);
    if (!reminder) return { success: false };

    reminder.triggered = false;
    reminder.snoozedUntil = Date.now() + (minutes * 60 * 1000);

    const task = this.tasks.get(reminder.taskId);
    if (task) {
      task.updatedAt = Date.now();
      await this.saveTask(task);
    }

    this.emit('reminder:snoozed', reminder);
    return { success: true };
  }

  // -------------------------------------------------------------------------
  // LISTS
  // -------------------------------------------------------------------------

  async createList(name: string, options?: Partial<TaskList>): Promise<TaskList> {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    
    const list: TaskList = {
      id,
      name,
      color: options?.color,
      icon: options?.icon,
      isDefault: options?.isDefault || false,
      taskCount: 0,
      completedCount: 0,
      createdAt: Date.now(),
    };

    this.lists.set(id, list);
    await this.saveLists();

    this.emit('list:created', list);
    return list;
  }

  getLists(): TaskList[] {
    return Array.from(this.lists.values())
      .sort((a, b) => {
        if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }

  async updateList(id: string, data: Partial<TaskList>): Promise<{ success: boolean }> {
    const list = this.lists.get(id);
    if (!list) return { success: false };

    if (data.name !== undefined) list.name = data.name;
    if (data.color !== undefined) list.color = data.color;
    if (data.icon !== undefined) list.icon = data.icon;

    await this.saveLists();
    this.emit('list:updated', list);
    return { success: true };
  }

  async deleteList(id: string): Promise<{ success: boolean }> {
    const list = this.lists.get(id);
    if (!list || list.isDefault) return { success: false };

    // Move tasks to default list
    const defaultList = this.config.defaultList;
    for (const task of this.tasks.values()) {
      if (task.listId === id) {
        task.listId = defaultList;
        await this.saveTask(task);
      }
    }

    this.lists.delete(id);
    await this.saveLists();

    this.emit('list:deleted', id);
    return { success: true };
  }

  async moveToList(taskId: string, listId: string): Promise<{ success: boolean }> {
    return this.updateTask(taskId, { listId });
  }

  private updateListCounts(listId?: string): void {
    if (!listId) return;
    
    const list = this.lists.get(listId);
    if (list) {
      const tasks = Array.from(this.tasks.values()).filter(t => t.listId === listId);
      list.taskCount = tasks.length;
      list.completedCount = tasks.filter(t => t.status === 'completed').length;
    }
  }

  // -------------------------------------------------------------------------
  // RECURRENCE
  // -------------------------------------------------------------------------

  async setRecurrence(taskId: string, rule?: RecurrenceRule): Promise<{ success: boolean }> {
    const task = this.tasks.get(taskId);
    if (!task) return { success: false };

    task.recurrence = rule;
    task.updatedAt = Date.now();

    await this.saveTask(task);
    this.emit('task:updated', task);
    return { success: true };
  }

  private async createNextRecurrence(completedTask: Task): Promise<void> {
    if (!completedTask.recurrence) return;

    const rule = completedTask.recurrence;
    
    // Check if we've hit the max occurrences
    if (rule.maxOccurrences && rule.occurrenceCount >= rule.maxOccurrences) {
      return;
    }

    // Calculate next due date
    let nextDue = completedTask.dueDate || Date.now();
    
    switch (rule.type) {
      case 'daily':
        nextDue += rule.interval * 24 * 60 * 60 * 1000;
        break;
      case 'weekly':
        nextDue += rule.interval * 7 * 24 * 60 * 60 * 1000;
        break;
      case 'monthly':
        const date = new Date(nextDue);
        date.setMonth(date.getMonth() + rule.interval);
        nextDue = date.getTime();
        break;
      case 'yearly':
        const yearDate = new Date(nextDue);
        yearDate.setFullYear(yearDate.getFullYear() + rule.interval);
        nextDue = yearDate.getTime();
        break;
    }

    // Check end date
    if (rule.endDate && nextDue > rule.endDate) {
      return;
    }

    // Create next task
    await this.createTask({
      title: completedTask.title,
      description: completedTask.description,
      priority: completedTask.priority,
      dueDate: nextDue,
      dueTime: completedTask.dueTime,
      listId: completedTask.listId,
      tags: completedTask.tags,
      notes: completedTask.notes,
      estimatedMinutes: completedTask.estimatedMinutes,
      recurrence: {
        ...rule,
        occurrenceCount: rule.occurrenceCount + 1,
      },
    });
  }

  // -------------------------------------------------------------------------
  // SMART QUERIES
  // -------------------------------------------------------------------------

  getTodayTasks(): Task[] {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 24 * 60 * 60 * 1000;

    return this.listTasks({
      status: ['pending', 'in-progress'],
      dueAfter: todayStart,
      dueBefore: todayEnd,
    });
  }

  getUpcomingTasks(days = 7): Task[] {
    const now = Date.now();
    const endDate = now + (days * 24 * 60 * 60 * 1000);

    return this.listTasks({
      status: ['pending', 'in-progress'],
      dueAfter: now,
      dueBefore: endDate,
    });
  }

  getOverdueTasks(): Task[] {
    const now = Date.now();
    
    return Array.from(this.tasks.values())
      .filter(t => 
        t.status !== 'completed' && 
        t.status !== 'cancelled' && 
        t.dueDate && 
        t.dueDate < now
      )
      .sort((a, b) => (a.dueDate || 0) - (b.dueDate || 0));
  }

  searchTasks(query: string): Task[] {
    return this.listTasks({ search: query });
  }

  getAllTags(): { tag: string; count: number }[] {
    const tagCounts = new Map<string, number>();
    
    for (const task of this.tasks.values()) {
      for (const tag of task.tags) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      }
    }

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
  }

  // -------------------------------------------------------------------------
  // BULK OPERATIONS
  // -------------------------------------------------------------------------

  async bulkComplete(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const result = await this.completeTask(id);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  async bulkDelete(ids: string[]): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (const id of ids) {
      const result = await this.deleteTask(id);
      if (result.success) success++;
      else failed++;
    }

    return { success, failed };
  }

  // -------------------------------------------------------------------------
  // STATS
  // -------------------------------------------------------------------------

  getStats(): TaskStats {
    const tasks = Array.from(this.tasks.values());
    const now = Date.now();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const weekEnd = todayStart + (7 * 24 * 60 * 60 * 1000);

    const byPriority: Record<TaskPriority, number> = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0,
    };

    const byList: Record<string, number> = {};
    let totalCompletionTime = 0;
    let completedWithTime = 0;

    for (const task of tasks) {
      byPriority[task.priority]++;
      
      const listId = task.listId || 'unassigned';
      byList[listId] = (byList[listId] || 0) + 1;

      if (task.status === 'completed' && task.completedAt) {
        totalCompletionTime += task.completedAt - task.createdAt;
        completedWithTime++;
      }
    }

    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in-progress').length;

    return {
      totalTasks: tasks.length,
      pendingTasks,
      completedTasks,
      overdueTasks: this.getOverdueTasks().length,
      todayTasks: tasks.filter(t => t.dueDate && t.dueDate >= todayStart && t.dueDate < todayStart + 86400000).length,
      thisWeekTasks: tasks.filter(t => t.dueDate && t.dueDate >= todayStart && t.dueDate < weekEnd).length,
      byPriority,
      byList,
      completionRate: tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0,
      avgCompletionTime: completedWithTime > 0 ? totalCompletionTime / completedWithTime : 0,
    };
  }

  // -------------------------------------------------------------------------
  // UTILITIES
  // -------------------------------------------------------------------------

  async setConfig(config: Partial<TasksConfig>): Promise<{ success: boolean }> {
    this.config = { ...this.config, ...config };
    await this.saveConfig();
    return { success: true };
  }

  private notifyRenderer(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTENCE
  // -------------------------------------------------------------------------

  private async loadTasks(): Promise<void> {
    try {
      const files = await fs.readdir(this.dataPath);
      
      for (const file of files) {
        if (file.startsWith('task-') && file.endsWith('.json')) {
          const data = await fs.readFile(path.join(this.dataPath, file), 'utf-8');
          const task = JSON.parse(data) as Task;
          this.tasks.set(task.id, task);
          
          // Index reminders
          for (const reminder of task.reminders) {
            this.reminders.set(reminder.id, reminder);
          }
          
          // Extract ID counter
          const match = task.id.match(/task-(\d+)-/);
          if (match) {
            this.idCounter = Math.max(this.idCounter, parseInt(match[1]));
          }
        }
      }

      // Update list counts
      for (const listId of this.lists.keys()) {
        this.updateListCounts(listId);
      }
    } catch (error) {
      log.error('[Tasks] Failed to load tasks:', error);
    }
  }

  private async saveTask(task: Task): Promise<void> {
    try {
      const taskPath = path.join(this.dataPath, `${task.id}.json`);
      await fs.writeFile(taskPath, JSON.stringify(task, null, 2));
    } catch (error) {
      log.error('[Tasks] Failed to save task:', error);
    }
  }

  private async loadLists(): Promise<void> {
    try {
      const listsPath = path.join(this.dataPath, 'lists.json');
      const data = await fs.readFile(listsPath, 'utf-8');
      const lists = JSON.parse(data) as TaskList[];
      
      for (const list of lists) {
        this.lists.set(list.id, list);
      }
    } catch {
      // No lists yet
    }
  }

  private async saveLists(): Promise<void> {
    try {
      const listsPath = path.join(this.dataPath, 'lists.json');
      const lists = Array.from(this.lists.values());
      await fs.writeFile(listsPath, JSON.stringify(lists, null, 2));
    } catch (error) {
      log.error('[Tasks] Failed to save lists:', error);
    }
  }

  private async loadConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      const data = await fs.readFile(configPath, 'utf-8');
      this.config = { ...this.config, ...JSON.parse(data) };
    } catch {
      // Use defaults
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      const configPath = path.join(this.dataPath, 'config.json');
      await fs.writeFile(configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      log.error('[Tasks] Failed to save config:', error);
    }
  }

  // -------------------------------------------------------------------------
  // SHUTDOWN
  // -------------------------------------------------------------------------

  async shutdown(): Promise<void> {
    if (this.reminderCheckInterval) {
      clearInterval(this.reminderCheckInterval);
    }
    await this.saveLists();
    await this.saveConfig();
  }
}

// ===========================================================================
// SINGLETON EXPORT
// ===========================================================================

export const TaskReminderSystem = new TaskReminderSystemClass();
export default TaskReminderSystem;
