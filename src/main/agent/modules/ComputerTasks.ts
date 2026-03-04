// =============================================================================
// DEX Computer Tasks Module - Email, Browser, and Productivity Automation
// Handles email management, web tasks, and proactive suggestions
// =============================================================================

import { ipcMain, BrowserWindow, shell, clipboard, app } from 'electron';
import Store from 'electron-store';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { exec, spawn } from 'child_process';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface EmailAccount {
  id: string;
  name: string;
  email: string;
  provider: EmailProvider;
  connected: boolean;
  lastSync?: number;
}

export type EmailProvider = 'gmail' | 'outlook' | 'imap' | 'exchange';

export interface Email {
  id: string;
  accountId: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  subject: string;
  body: string;
  bodyHtml?: string;
  date: number;
  read: boolean;
  starred: boolean;
  labels: string[];
  attachments: EmailAttachment[];
  threadId?: string;
  priority: 'high' | 'normal' | 'low';
}

export interface EmailAddress {
  name?: string;
  email: string;
}

export interface EmailAttachment {
  id: string;
  name: string;
  type: string;
  size: number;
}

export interface EmailDraft {
  to: string[];
  cc?: string[];
  subject: string;
  body: string;
  attachments?: string[];
  replyTo?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: number;
  end: number;
  location?: string;
  attendees?: string[];
  reminders?: number[];
  isAllDay: boolean;
  recurrence?: string;
  color?: string;
}

export interface BrowserTask {
  id: string;
  type: 'navigate' | 'fill' | 'click' | 'extract' | 'screenshot' | 'search';
  url?: string;
  selector?: string;
  value?: string;
  waitFor?: number;
}

export interface WebWorkflow {
  id: string;
  name: string;
  description?: string;
  steps: BrowserTask[];
  variables: Record<string, string>;
  createdAt: number;
}

export interface AppInfo {
  name: string;
  path: string;
  icon?: string;
  lastUsed?: number;
  useCount: number;
}

export interface Suggestion {
  id: string;
  type: 'action' | 'reminder' | 'optimization' | 'insight';
  title: string;
  description: string;
  action?: string;
  priority: number;
  expiresAt?: number;
  dismissed: boolean;
}

export interface TaskSummary {
  completed: number;
  pending: number;
  overdue: number;
  productivity: number;
  topCategories: Array<{ name: string; count: number }>;
}

export interface ComputerTasksConfig {
  emailSyncInterval: number;
  calendarSyncInterval: number;
  proactiveSuggestions: boolean;
  autoOrganizeInbox: boolean;
  smartReplies: boolean;
  browserAutomation: boolean;
}

// -----------------------------------------------------------------------------
// Computer Tasks Manager
// -----------------------------------------------------------------------------

class ComputerTasksManager extends EventEmitter {
  private store: Store;
  private mainWindow: BrowserWindow | null = null;
  private emailAccounts: Map<string, EmailAccount> = new Map();
  private emails: Map<string, Email> = new Map();
  private calendarEvents: Map<string, CalendarEvent> = new Map();
  private webWorkflows: Map<string, WebWorkflow> = new Map();
  private installedApps: Map<string, AppInfo> = new Map();
  private suggestions: Suggestion[] = [];
  private config: ComputerTasksConfig;
  private syncIntervals: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();

    this.store = new Store({
      name: 'dex-computer-tasks',
      defaults: {
        emailAccounts: [],
        emails: [],
        calendarEvents: [],
        webWorkflows: [],
        installedApps: [],
        suggestions: [],
        config: {
          emailSyncInterval: 300000, // 5 minutes
          calendarSyncInterval: 600000, // 10 minutes
          proactiveSuggestions: true,
          autoOrganizeInbox: false,
          smartReplies: true,
          browserAutomation: true,
        },
      },
    });

    this.config = this.store.get('config') as ComputerTasksConfig;
    this.loadData();
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  initialize(mainWindow: BrowserWindow): void {
    this.mainWindow = mainWindow;
    this.registerIPCHandlers();
    this.discoverInstalledApps();
    this.startSyncTimers();
    this.generateInitialSuggestions();
    this.emit('initialized');
  }

  private loadData(): void {
    const accounts = this.store.get('emailAccounts', []) as EmailAccount[];
    accounts.forEach(acc => this.emailAccounts.set(acc.id, acc));

    const emails = this.store.get('emails', []) as Email[];
    emails.forEach(email => this.emails.set(email.id, email));

    const events = this.store.get('calendarEvents', []) as CalendarEvent[];
    events.forEach(event => this.calendarEvents.set(event.id, event));

    const workflows = this.store.get('webWorkflows', []) as WebWorkflow[];
    workflows.forEach(wf => this.webWorkflows.set(wf.id, wf));

    const apps = this.store.get('installedApps', []) as AppInfo[];
    apps.forEach(app => this.installedApps.set(app.name, app));

    this.suggestions = this.store.get('suggestions', []) as Suggestion[];
  }

  private saveData(): void {
    this.store.set('emailAccounts', Array.from(this.emailAccounts.values()));
    this.store.set('emails', Array.from(this.emails.values()));
    this.store.set('calendarEvents', Array.from(this.calendarEvents.values()));
    this.store.set('webWorkflows', Array.from(this.webWorkflows.values()));
    this.store.set('installedApps', Array.from(this.installedApps.values()));
    this.store.set('suggestions', this.suggestions);
    this.store.set('config', this.config);
  }

  private registerIPCHandlers(): void {
    // Email management
    ipcMain.handle('computer:get-email-accounts', async () => this.getEmailAccounts());
    ipcMain.handle('computer:add-email-account', async (_, account: Partial<EmailAccount>) => 
      this.addEmailAccount(account));
    ipcMain.handle('computer:remove-email-account', async (_, id: string) => 
      this.removeEmailAccount(id));
    ipcMain.handle('computer:sync-emails', async (_, accountId?: string) => 
      this.syncEmails(accountId));
    ipcMain.handle('computer:get-emails', async (_, options?: { 
      accountId?: string; 
      unreadOnly?: boolean; 
      limit?: number;
      search?: string;
    }) => this.getEmails(options));
    ipcMain.handle('computer:get-email', async (_, id: string) => this.getEmail(id));
    ipcMain.handle('computer:mark-email-read', async (_, id: string, read: boolean) => 
      this.markEmailRead(id, read));
    ipcMain.handle('computer:star-email', async (_, id: string, starred: boolean) => 
      this.starEmail(id, starred));
    ipcMain.handle('computer:delete-email', async (_, id: string) => this.deleteEmail(id));
    ipcMain.handle('computer:compose-email', async (_, draft: EmailDraft) => 
      this.composeEmail(draft));
    ipcMain.handle('computer:send-email', async (_, draft: EmailDraft) => 
      this.sendEmail(draft));
    ipcMain.handle('computer:generate-reply', async (_, emailId: string) => 
      this.generateSmartReply(emailId));
    ipcMain.handle('computer:categorize-emails', async () => this.categorizeEmails());

    // Calendar
    ipcMain.handle('computer:get-calendar-events', async (_, options?: {
      start?: number;
      end?: number;
    }) => this.getCalendarEvents(options));
    ipcMain.handle('computer:add-calendar-event', async (_, event: Partial<CalendarEvent>) => 
      this.addCalendarEvent(event));
    ipcMain.handle('computer:update-calendar-event', async (_, id: string, updates: Partial<CalendarEvent>) => 
      this.updateCalendarEvent(id, updates));
    ipcMain.handle('computer:delete-calendar-event', async (_, id: string) => 
      this.deleteCalendarEvent(id));
    ipcMain.handle('computer:get-upcoming-events', async (_, hours?: number) => 
      this.getUpcomingEvents(hours));

    // Web automation
    ipcMain.handle('computer:get-web-workflows', async () => this.getWebWorkflows());
    ipcMain.handle('computer:add-web-workflow', async (_, workflow: Partial<WebWorkflow>) => 
      this.addWebWorkflow(workflow));
    ipcMain.handle('computer:update-web-workflow', async (_, id: string, updates: Partial<WebWorkflow>) => 
      this.updateWebWorkflow(id, updates));
    ipcMain.handle('computer:delete-web-workflow', async (_, id: string) => 
      this.deleteWebWorkflow(id));
    ipcMain.handle('computer:run-web-workflow', async (_, id: string, variables?: Record<string, string>) => 
      this.runWebWorkflow(id, variables));
    ipcMain.handle('computer:open-url', async (_, url: string) => this.openUrl(url));
    ipcMain.handle('computer:search-web', async (_, query: string, engine?: string) => 
      this.searchWeb(query, engine));

    // Applications
    ipcMain.handle('computer:get-installed-apps', async () => this.getInstalledApps());
    ipcMain.handle('computer:launch-app', async (_, appName: string) => this.launchApp(appName));
    ipcMain.handle('computer:search-apps', async (_, query: string) => this.searchApps(query));

    // Clipboard
    ipcMain.handle('computer:get-clipboard', async () => this.getClipboard());
    ipcMain.handle('computer:set-clipboard', async (_, text: string) => this.setClipboard(text));

    // Suggestions
    ipcMain.handle('computer:get-suggestions', async () => this.getSuggestions());
    ipcMain.handle('computer:dismiss-suggestion', async (_, id: string) => 
      this.dismissSuggestion(id));
    ipcMain.handle('computer:execute-suggestion', async (_, id: string) => 
      this.executeSuggestion(id));

    // Summary and insights
    ipcMain.handle('computer:get-daily-summary', async () => this.getDailySummary());
    ipcMain.handle('computer:get-productivity-insights', async () => this.getProductivityInsights());

    // Configuration
    ipcMain.handle('computer:get-config', async () => this.config);
    ipcMain.handle('computer:update-config', async (_, updates: Partial<ComputerTasksConfig>) => 
      this.updateConfig(updates));
  }

  // ---------------------------------------------------------------------------
  // Email Management
  // ---------------------------------------------------------------------------

  getEmailAccounts(): EmailAccount[] {
    return Array.from(this.emailAccounts.values());
  }

  addEmailAccount(accountData: Partial<EmailAccount>): EmailAccount {
    const id = accountData.id || `email_${Date.now()}`;
    const account: EmailAccount = {
      id,
      name: accountData.name || 'Email Account',
      email: accountData.email || '',
      provider: accountData.provider || 'imap',
      connected: false,
    };

    this.emailAccounts.set(id, account);
    this.saveData();
    return account;
  }

  removeEmailAccount(id: string): boolean {
    const result = this.emailAccounts.delete(id);
    if (result) {
      // Remove associated emails
      for (const [emailId, email] of this.emails) {
        if (email.accountId === id) {
          this.emails.delete(emailId);
        }
      }
      this.saveData();
    }
    return result;
  }

  async syncEmails(accountId?: string): Promise<{ synced: number; errors: string[] }> {
    const accounts = accountId 
      ? [this.emailAccounts.get(accountId)].filter(Boolean) as EmailAccount[]
      : Array.from(this.emailAccounts.values());

    let synced = 0;
    const errors: string[] = [];

    for (const account of accounts) {
      try {
        // Real email sync requires OS-level mail API integration (e.g., MAPI on Windows,
        // Mail.framework on macOS). Currently disabled — future work to integrate native mail.
        // Mark account as connected but don't fabricate fake emails.
        account.lastSync = Date.now();
        account.connected = true;
        // synced count remains 0 until real mail integration is implemented
      } catch (error) {
        errors.push(`Failed to sync ${account.email}: ${error}`);
        account.connected = false;
      }
    }

    this.saveData();
    this.mainWindow?.webContents.send('computer:emails-synced', { synced, errors });

    // Auto-organize if enabled
    if (this.config.autoOrganizeInbox && synced > 0) {
      await this.categorizeEmails();
    }

    return { synced, errors };
  }

  /**
   * Placeholder for real email retrieval.
   * Will integrate with native mail APIs when available.
   */
  private generateSampleEmails(_account: EmailAccount): Email[] {
    // No more fake emails — return empty until real mail integration
    return [];
  }

  getEmails(options?: {
    accountId?: string;
    unreadOnly?: boolean;
    limit?: number;
    search?: string;
  }): Email[] {
    let emails = Array.from(this.emails.values());

    if (options?.accountId) {
      emails = emails.filter(e => e.accountId === options.accountId);
    }

    if (options?.unreadOnly) {
      emails = emails.filter(e => !e.read);
    }

    if (options?.search) {
      const query = options.search.toLowerCase();
      emails = emails.filter(e => 
        e.subject.toLowerCase().includes(query) ||
        e.body.toLowerCase().includes(query) ||
        e.from.email.toLowerCase().includes(query)
      );
    }

    // Sort by date, newest first
    emails.sort((a, b) => b.date - a.date);

    if (options?.limit) {
      emails = emails.slice(0, options.limit);
    }

    return emails;
  }

  getEmail(id: string): Email | undefined {
    return this.emails.get(id);
  }

  markEmailRead(id: string, read: boolean): boolean {
    const email = this.emails.get(id);
    if (email) {
      email.read = read;
      this.saveData();
      return true;
    }
    return false;
  }

  starEmail(id: string, starred: boolean): boolean {
    const email = this.emails.get(id);
    if (email) {
      email.starred = starred;
      this.saveData();
      return true;
    }
    return false;
  }

  deleteEmail(id: string): boolean {
    const result = this.emails.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  composeEmail(draft: EmailDraft): { success: boolean; previewUrl?: string } {
    // Generate mailto URL for system email client
    const to = draft.to.join(',');
    const subject = encodeURIComponent(draft.subject);
    const body = encodeURIComponent(draft.body);
    const cc = draft.cc ? `&cc=${draft.cc.join(',')}` : '';

    const mailtoUrl = `mailto:${to}?subject=${subject}&body=${body}${cc}`;

    return {
      success: true,
      previewUrl: mailtoUrl,
    };
  }

  async sendEmail(draft: EmailDraft): Promise<{ success: boolean; message: string }> {
    // In a real implementation, this would use the email account's SMTP settings
    // For now, open the system email client
    const { previewUrl } = this.composeEmail(draft);
    if (previewUrl) {
      await shell.openExternal(previewUrl);
      return { success: true, message: 'Email opened in default mail client' };
    }
    return { success: false, message: 'Failed to compose email' };
  }

  async generateSmartReply(emailId: string): Promise<string[]> {
    const email = this.emails.get(emailId);
    if (!email || !this.config.smartReplies) {
      return [];
    }

    // Simple rule-based smart replies
    const replies: string[] = [];
    const subjectLower = email.subject.toLowerCase();
    const bodyLower = email.body.toLowerCase();

    if (subjectLower.includes('meeting') || bodyLower.includes('meeting')) {
      replies.push('I will attend the meeting.');
      replies.push('Unfortunately, I cannot make it. Can we reschedule?');
      replies.push('Thanks for the invite. I will confirm shortly.');
    }

    if (subjectLower.includes('update') || subjectLower.includes('status')) {
      replies.push('Thank you for the update!');
      replies.push('Noted. I will review and get back to you.');
      replies.push('Thanks! Any blockers I should know about?');
    }

    if (subjectLower.includes('question') || bodyLower.includes('?')) {
      replies.push('Good question! Let me check and get back to you.');
      replies.push('I can help with that. Give me a moment.');
      replies.push('Please see my response below.');
    }

    // Default replies if none matched
    if (replies.length === 0) {
      replies.push('Thank you for your email.');
      replies.push('I will get back to you soon.');
      replies.push('Noted. Thanks for letting me know.');
    }

    return replies;
  }

  async categorizeEmails(): Promise<Record<string, number>> {
    const categories: Record<string, string[]> = {
      work: [],
      personal: [],
      newsletters: [],
      promotions: [],
      social: [],
      important: [],
    };

    for (const email of this.emails.values()) {
      const subject = email.subject.toLowerCase();
      const from = email.from.email.toLowerCase();

      // Simple categorization rules
      if (from.includes('newsletter') || subject.includes('newsletter') || subject.includes('digest')) {
        email.labels = ['newsletters'];
        categories.newsletters.push(email.id);
      } else if (from.includes('noreply') || subject.includes('sale') || subject.includes('discount')) {
        email.labels = ['promotions'];
        categories.promotions.push(email.id);
      } else if (from.includes('linkedin') || from.includes('facebook') || from.includes('twitter')) {
        email.labels = ['social'];
        categories.social.push(email.id);
      } else if (email.priority === 'high' || email.starred) {
        email.labels = ['important'];
        categories.important.push(email.id);
      } else {
        email.labels = ['work'];
        categories.work.push(email.id);
      }
    }

    this.saveData();

    const result: Record<string, number> = {};
    for (const [category, emails] of Object.entries(categories)) {
      result[category] = emails.length;
    }

    return result;
  }

  // ---------------------------------------------------------------------------
  // Calendar Management
  // ---------------------------------------------------------------------------

  getCalendarEvents(options?: { start?: number; end?: number }): CalendarEvent[] {
    let events = Array.from(this.calendarEvents.values());

    if (options?.start) {
      events = events.filter(e => e.end >= options.start!);
    }
    if (options?.end) {
      events = events.filter(e => e.start <= options.end!);
    }

    events.sort((a, b) => a.start - b.start);
    return events;
  }

  addCalendarEvent(eventData: Partial<CalendarEvent>): CalendarEvent {
    const id = eventData.id || `event_${Date.now()}`;
    const event: CalendarEvent = {
      id,
      title: eventData.title || 'New Event',
      description: eventData.description,
      start: eventData.start || Date.now(),
      end: eventData.end || Date.now() + 3600000,
      location: eventData.location,
      attendees: eventData.attendees,
      reminders: eventData.reminders || [15], // 15 min default
      isAllDay: eventData.isAllDay || false,
      recurrence: eventData.recurrence,
      color: eventData.color,
    };

    this.calendarEvents.set(id, event);
    this.saveData();
    return event;
  }

  updateCalendarEvent(id: string, updates: Partial<CalendarEvent>): CalendarEvent | null {
    const event = this.calendarEvents.get(id);
    if (!event) return null;

    Object.assign(event, updates);
    this.saveData();
    return event;
  }

  deleteCalendarEvent(id: string): boolean {
    const result = this.calendarEvents.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  getUpcomingEvents(hours: number = 24): CalendarEvent[] {
    const now = Date.now();
    const end = now + hours * 60 * 60 * 1000;
    return this.getCalendarEvents({ start: now, end });
  }

  // ---------------------------------------------------------------------------
  // Web Automation
  // ---------------------------------------------------------------------------

  getWebWorkflows(): WebWorkflow[] {
    return Array.from(this.webWorkflows.values());
  }

  addWebWorkflow(workflowData: Partial<WebWorkflow>): WebWorkflow {
    const id = workflowData.id || `workflow_${Date.now()}`;
    const workflow: WebWorkflow = {
      id,
      name: workflowData.name || 'New Workflow',
      description: workflowData.description,
      steps: workflowData.steps || [],
      variables: workflowData.variables || {},
      createdAt: Date.now(),
    };

    this.webWorkflows.set(id, workflow);
    this.saveData();
    return workflow;
  }

  updateWebWorkflow(id: string, updates: Partial<WebWorkflow>): WebWorkflow | null {
    const workflow = this.webWorkflows.get(id);
    if (!workflow) return null;

    Object.assign(workflow, updates);
    this.saveData();
    return workflow;
  }

  deleteWebWorkflow(id: string): boolean {
    const result = this.webWorkflows.delete(id);
    if (result) {
      this.saveData();
    }
    return result;
  }

  async runWebWorkflow(
    id: string,
    variables?: Record<string, string>
  ): Promise<{ success: boolean; results: unknown[] }> {
    const workflow = this.webWorkflows.get(id);
    if (!workflow || !this.config.browserAutomation) {
      return { success: false, results: [] };
    }

    const mergedVars = { ...workflow.variables, ...variables };
    const results: unknown[] = [];

    for (const step of workflow.steps) {
      try {
        const result = await this.executeWebStep(step, mergedVars);
        results.push(result);
      } catch (error) {
        results.push({ error: String(error) });
        break;
      }

      if (step.waitFor) {
        await new Promise(resolve => setTimeout(resolve, step.waitFor));
      }
    }

    return { success: true, results };
  }

  private async executeWebStep(
    step: BrowserTask,
    variables: Record<string, string>
  ): Promise<unknown> {
    // Substitute variables in step parameters
    const processedUrl = step.url ? this.substituteVariables(step.url, variables) : undefined;
    const processedValue = step.value ? this.substituteVariables(step.value, variables) : undefined;

    switch (step.type) {
      case 'navigate':
        if (processedUrl) {
          await shell.openExternal(processedUrl);
          return { navigated: processedUrl };
        }
        break;

      case 'search':
        if (processedValue) {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(processedValue)}`;
          await shell.openExternal(searchUrl);
          return { searched: processedValue };
        }
        break;

      case 'fill':
      case 'click':
      case 'extract':
      case 'screenshot':
        // These would require a browser automation library like Puppeteer
        // For now, return a placeholder
        return { step: step.type, status: 'not_implemented' };
    }

    return { step: step.type, status: 'completed' };
  }

  private substituteVariables(text: string, variables: Record<string, string>): string {
    let result = text;
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }
    return result;
  }

  async openUrl(url: string): Promise<boolean> {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  }

  async searchWeb(query: string, engine: string = 'google'): Promise<boolean> {
    const engines: Record<string, string> = {
      google: 'https://www.google.com/search?q=',
      bing: 'https://www.bing.com/search?q=',
      duckduckgo: 'https://duckduckgo.com/?q=',
    };

    const baseUrl = engines[engine] || engines.google;
    const url = `${baseUrl}${encodeURIComponent(query)}`;

    return this.openUrl(url);
  }

  // ---------------------------------------------------------------------------
  // Application Management
  // ---------------------------------------------------------------------------

  getInstalledApps(): AppInfo[] {
    return Array.from(this.installedApps.values())
      .sort((a, b) => (b.lastUsed || 0) - (a.lastUsed || 0));
  }

  private async discoverInstalledApps(): Promise<void> {
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        await this.discoverWindowsApps();
      } else if (platform === 'darwin') {
        await this.discoverMacApps();
      } else if (platform === 'linux') {
        await this.discoverLinuxApps();
      }
    } catch {
      // Ignore discovery errors
    }

    this.saveData();
  }

  private async discoverWindowsApps(): Promise<void> {
    // Common Windows app locations
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const userApps = path.join(app.getPath('home'), 'AppData', 'Local');

    const commonApps = [
      { name: 'Chrome', paths: [
        path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ]},
      { name: 'Firefox', paths: [
        path.join(programFiles, 'Mozilla Firefox', 'firefox.exe'),
        path.join(programFilesX86, 'Mozilla Firefox', 'firefox.exe'),
      ]},
      { name: 'VS Code', paths: [
        path.join(userApps, 'Programs', 'Microsoft VS Code', 'Code.exe'),
        path.join(programFiles, 'Microsoft VS Code', 'Code.exe'),
      ]},
      { name: 'Notepad', paths: ['C:\\Windows\\System32\\notepad.exe']},
      { name: 'Calculator', paths: ['calc.exe']},
      { name: 'Explorer', paths: ['explorer.exe']},
    ];

    for (const app of commonApps) {
      for (const appPath of app.paths) {
        try {
          if (fs.existsSync(appPath) || appPath === 'calc.exe' || appPath === 'explorer.exe') {
            this.installedApps.set(app.name, {
              name: app.name,
              path: appPath,
              useCount: 0,
            });
            break;
          }
        } catch {
          // Continue to next path
        }
      }
    }
  }

  private async discoverMacApps(): Promise<void> {
    const applicationsPath = '/Applications';
    
    try {
      const apps = fs.readdirSync(applicationsPath);
      for (const appFile of apps) {
        if (appFile.endsWith('.app')) {
          const appName = appFile.replace('.app', '');
          this.installedApps.set(appName, {
            name: appName,
            path: path.join(applicationsPath, appFile),
            useCount: 0,
          });
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  private async discoverLinuxApps(): Promise<void> {
    const desktopPaths = [
      '/usr/share/applications',
      path.join(app.getPath('home'), '.local', 'share', 'applications'),
    ];

    for (const desktopPath of desktopPaths) {
      try {
        const files = fs.readdirSync(desktopPath);
        for (const file of files) {
          if (file.endsWith('.desktop')) {
            const appName = file.replace('.desktop', '');
            this.installedApps.set(appName, {
              name: appName,
              path: path.join(desktopPath, file),
              useCount: 0,
            });
          }
        }
      } catch {
        // Continue to next path
      }
    }
  }

  async launchApp(appName: string): Promise<{ success: boolean; message: string }> {
    const appInfo = this.installedApps.get(appName);
    
    if (!appInfo) {
      // Try to find by partial match
      for (const [name, info] of this.installedApps) {
        if (name.toLowerCase().includes(appName.toLowerCase())) {
          return this.launchApp(name);
        }
      }
      return { success: false, message: `App not found: ${appName}` };
    }

    try {
      const platform = process.platform;
      
      if (platform === 'win32') {
        exec(`start "" "${appInfo.path}"`);
      } else if (platform === 'darwin') {
        exec(`open "${appInfo.path}"`);
      } else {
        spawn('xdg-open', [appInfo.path], { detached: true });
      }

      // Update usage stats
      appInfo.lastUsed = Date.now();
      appInfo.useCount++;
      this.saveData();

      return { success: true, message: `Launched ${appName}` };
    } catch (error) {
      return { success: false, message: `Failed to launch: ${error}` };
    }
  }

  searchApps(query: string): AppInfo[] {
    const queryLower = query.toLowerCase();
    return Array.from(this.installedApps.values())
      .filter(app => app.name.toLowerCase().includes(queryLower))
      .sort((a, b) => b.useCount - a.useCount);
  }

  // ---------------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------------

  getClipboard(): { text: string; html?: string } {
    return {
      text: clipboard.readText(),
      html: clipboard.readHTML() || undefined,
    };
  }

  setClipboard(text: string): void {
    clipboard.writeText(text);
  }

  // ---------------------------------------------------------------------------
  // Proactive Suggestions
  // ---------------------------------------------------------------------------

  getSuggestions(): Suggestion[] {
    // Filter out expired and dismissed suggestions
    const now = Date.now();
    this.suggestions = this.suggestions.filter(s => 
      !s.dismissed && (!s.expiresAt || s.expiresAt > now)
    );
    return this.suggestions.sort((a, b) => b.priority - a.priority);
  }

  dismissSuggestion(id: string): boolean {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (suggestion) {
      suggestion.dismissed = true;
      this.saveData();
      return true;
    }
    return false;
  }

  async executeSuggestion(id: string): Promise<{ success: boolean; message: string }> {
    const suggestion = this.suggestions.find(s => s.id === id);
    if (!suggestion || !suggestion.action) {
      return { success: false, message: 'Suggestion not found or has no action' };
    }

    // Execute the suggestion's action
    const [type, ...params] = suggestion.action.split(':');

    switch (type) {
      case 'email':
        if (params[0] === 'check') {
          await this.syncEmails();
        }
        break;
      case 'calendar':
        if (params[0] === 'show') {
          this.mainWindow?.webContents.send('navigate', 'scheduler');
        }
        break;
      case 'app':
        if (params[0] === 'launch') {
          return this.launchApp(params[1]);
        }
        break;
      case 'url':
        await this.openUrl(params.join(':'));
        break;
    }

    this.dismissSuggestion(id);
    return { success: true, message: 'Suggestion executed' };
  }

  private generateInitialSuggestions(): void {
    if (!this.config.proactiveSuggestions) return;

    const now = new Date();
    const hour = now.getHours();

    // Morning suggestions
    if (hour >= 7 && hour <= 9) {
      this.addSuggestion({
        type: 'action',
        title: 'Check your inbox',
        description: 'Start your day by reviewing new emails',
        action: 'email:check',
        priority: 8,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000, // 2 hours
      });

      this.addSuggestion({
        type: 'action',
        title: 'Review today\'s schedule',
        description: 'See what meetings and events you have today',
        action: 'calendar:show',
        priority: 9,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      });
    }

    // Afternoon check-in
    if (hour >= 14 && hour <= 15) {
      this.addSuggestion({
        type: 'reminder',
        title: 'Afternoon check-in',
        description: 'Review progress and plan remaining tasks',
        priority: 6,
        expiresAt: Date.now() + 60 * 60 * 1000,
      });
    }

    // End of day
    if (hour >= 17 && hour <= 18) {
      this.addSuggestion({
        type: 'insight',
        title: 'End of day summary',
        description: 'Review what you accomplished today',
        action: 'summary:daily',
        priority: 7,
        expiresAt: Date.now() + 2 * 60 * 60 * 1000,
      });
    }
  }

  private addSuggestion(data: Omit<Suggestion, 'id' | 'dismissed'>): void {
    const suggestion: Suggestion = {
      id: `suggestion_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      ...data,
      dismissed: false,
    };

    // Don't add duplicates
    const isDuplicate = this.suggestions.some(s => 
      s.title === suggestion.title && !s.dismissed
    );

    if (!isDuplicate) {
      this.suggestions.push(suggestion);
      this.saveData();
    }
  }

  // ---------------------------------------------------------------------------
  // Summary and Insights
  // ---------------------------------------------------------------------------

  getDailySummary(): {
    date: string;
    emails: { received: number; sent: number; unread: number };
    events: { total: number; upcoming: CalendarEvent[] };
    productivity: TaskSummary;
  } {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const endOfDay = startOfDay + 24 * 60 * 60 * 1000;

    // Email stats
    const todayEmails = Array.from(this.emails.values())
      .filter(e => e.date >= startOfDay && e.date < endOfDay);
    
    const unreadEmails = Array.from(this.emails.values())
      .filter(e => !e.read);

    // Calendar events
    const todayEvents = this.getCalendarEvents({ start: startOfDay, end: endOfDay });
    const upcomingEvents = this.getUpcomingEvents(4);

    return {
      date: today.toISOString().split('T')[0],
      emails: {
        received: todayEmails.length,
        sent: 0, // Would track sent emails
        unread: unreadEmails.length,
      },
      events: {
        total: todayEvents.length,
        upcoming: upcomingEvents,
      },
      productivity: {
        completed: 0,
        pending: 0,
        overdue: 0,
        productivity: 75, // Placeholder
        topCategories: [],
      },
    };
  }

  getProductivityInsights(): Array<{ type: string; message: string; value?: number }> {
    const insights: Array<{ type: string; message: string; value?: number }> = [];
    const summary = this.getDailySummary();

    // Email insights
    if (summary.emails.unread > 10) {
      insights.push({
        type: 'email',
        message: `You have ${summary.emails.unread} unread emails. Consider setting aside time to process them.`,
        value: summary.emails.unread,
      });
    }

    // Calendar insights
    if (summary.events.total > 5) {
      insights.push({
        type: 'calendar',
        message: `Busy day ahead with ${summary.events.total} events. Make sure to schedule breaks.`,
        value: summary.events.total,
      });
    }

    // App usage insights
    const topApps = Array.from(this.installedApps.values())
      .sort((a, b) => b.useCount - a.useCount)
      .slice(0, 3);

    if (topApps.length > 0) {
      insights.push({
        type: 'apps',
        message: `Your most used apps: ${topApps.map(a => a.name).join(', ')}`,
      });
    }

    return insights;
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  updateConfig(updates: Partial<ComputerTasksConfig>): ComputerTasksConfig {
    this.config = { ...this.config, ...updates };
    this.saveData();

    // Restart sync timers if intervals changed
    if ('emailSyncInterval' in updates || 'calendarSyncInterval' in updates) {
      this.stopSyncTimers();
      this.startSyncTimers();
    }

    return this.config;
  }

  private startSyncTimers(): void {
    // Email sync
    const emailInterval = setInterval(() => {
      this.syncEmails();
    }, this.config.emailSyncInterval);
    this.syncIntervals.set('email', emailInterval);

    // Calendar sync (placeholder)
    const calendarInterval = setInterval(() => {
      // Would sync calendar here
    }, this.config.calendarSyncInterval);
    this.syncIntervals.set('calendar', calendarInterval);

    // Suggestion refresh
    const suggestionInterval = setInterval(() => {
      this.generateInitialSuggestions();
    }, 60 * 60 * 1000); // Every hour
    this.syncIntervals.set('suggestions', suggestionInterval);
  }

  private stopSyncTimers(): void {
    for (const interval of this.syncIntervals.values()) {
      clearInterval(interval);
    }
    this.syncIntervals.clear();
  }

  // ---------------------------------------------------------------------------
  // Shutdown
  // ---------------------------------------------------------------------------

  shutdown(): void {
    this.stopSyncTimers();
    this.saveData();
    this.emit('shutdown');
  }
}

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

export const computerTasks = new ComputerTasksManager();

export function initializeComputerTasks(mainWindow: BrowserWindow): void {
  computerTasks.initialize(mainWindow);
}

export function shutdownComputerTasks(): void {
  computerTasks.shutdown();
}
