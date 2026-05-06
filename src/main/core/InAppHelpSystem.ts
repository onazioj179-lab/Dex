// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * ===========================================================================
 * DEX - In-App Help System
 * ===========================================================================
 * 
 * Lightweight, context-aware documentation:
 * 1. Tooltips and contextual help
 * 2. Feature explanations
 * 3. Quick guides
 * 4. Searchable help content
 * 
 * PRINCIPLES:
 * - Help available where needed
 * - Non-intrusive
 * - Concise and actionable
 * - No external dependencies
 */

import { ipcMain, app, BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

// ===========================================================================
// Types
// ===========================================================================

export interface HelpTopic {
  id: string;
  title: string;
  category: HelpCategory;
  shortDescription: string;
  content: string;
  keywords: string[];
  relatedTopics: string[];
  lastUpdated: string;
}

export type HelpCategory = 
  | 'getting-started'
  | 'automation'
  | 'learning'
  | 'storage'
  | 'audio'
  | 'security'
  | 'governance'
  | 'troubleshooting';

export interface ContextualHelp {
  featureId: string;
  title: string;
  description: string;
  tips: string[];
  learnMoreTopic?: string;
}

export interface QuickGuide {
  id: string;
  title: string;
  description: string;
  steps: QuickGuideStep[];
  estimatedTime: string;
}

export interface QuickGuideStep {
  title: string;
  description: string;
  action?: string;
}

// ===========================================================================
// Help Content
// ===========================================================================

const HELP_TOPICS: HelpTopic[] = [
  // Getting Started
  {
    id: 'what-is-dex',
    title: 'What is Dex?',
    category: 'getting-started',
    shortDescription: 'Dex is your local OS intelligence layer.',
    content: `
# What is Dex?

Dex is a **local-first operating system intelligence layer** that helps you work smarter without compromising privacy.

## Key Principles

- **Everything stays local** - Your data never leaves your machine
- **You're always in control** - Every feature has an off switch
- **Transparent operation** - See exactly what Dex is doing
- **Privacy by design** - No telemetry, no cloud sync, no tracking

## What Dex Can Do

1. **Automate repetitive tasks** - Create workflows that trigger on file changes, schedules, or events
2. **Learn your patterns** - Dex observes how you work and offers smart suggestions
3. **Process content** - Extract, summarize, and organize files automatically
4. **Manage voice notes** - Record, transcribe, and attach audio to your projects
5. **Stay secure** - Encrypted vault, password management, and security controls

## Getting Started

1. Explore the dashboard to see system status
2. Check the Trust Dashboard to understand what Dex can access
3. Create your first automation
4. Review learning settings to control what patterns Dex collects
    `.trim(),
    keywords: ['intro', 'introduction', 'overview', 'about', 'basics'],
    relatedTopics: ['trust-dashboard', 'first-automation', 'privacy'],
    lastUpdated: '2024-01-15',
  },
  
  {
    id: 'trust-dashboard',
    title: 'Using the Trust Dashboard',
    category: 'governance',
    shortDescription: 'Your control center for privacy and automation.',
    content: `
# Trust Dashboard

The Trust Dashboard is your central control panel for understanding and controlling what Dex does.

## What You Can See

- **System Health** - Overall status of Dex systems
- **Active Automations** - Currently running automated tasks
- **Learning Status** - What patterns Dex has collected
- **Storage Usage** - How much disk space Dex is using

## Master Controls

### Automation Toggle
Turn all automations on or off with a single click. When disabled:
- No file watchers will trigger
- No scheduled tasks will run
- Manual execution still works

### Learning Toggle
Control pattern collection:
- When ON: Dex learns from your work patterns
- When OFF: No new patterns are collected (existing data preserved)

### Emergency Stop
Immediately disables all automated features. Use this if:
- Something unexpected is happening
- You need to investigate an issue
- You want to quickly pause everything

## Audit Log

Every significant action is logged:
- [OK] **Allowed** - Action completed successfully
- [NO] **Blocked** - Action prevented by rules
- [!] **Failed** - Action attempted but failed
- [...] **Pending** - Awaiting approval
    `.trim(),
    keywords: ['trust', 'control', 'privacy', 'permissions', 'audit'],
    relatedTopics: ['what-is-dex', 'automation-permissions', 'learning-privacy'],
    lastUpdated: '2024-01-15',
  },
  
  // Automation
  {
    id: 'first-automation',
    title: 'Creating Your First Automation',
    category: 'automation',
    shortDescription: 'Build a simple file organization workflow.',
    content: `
# Creating Your First Automation

Automations let you define workflows that run when triggered.

## Basic Structure

Every automation has:
1. **Name** - Descriptive identifier
2. **Trigger** - What starts the automation
3. **Steps** - Actions to perform

## Trigger Types

- **Manual** - Run when you click a button (safest)
- **File Created** - When a new file appears in a folder
- **File Modified** - When a file changes
- **Schedule** - At specific times (requires approval)
- **Event** - Custom system events

## Step Types

- **Filter** - Skip files that don't match criteria
- **Move/Copy** - Relocate or duplicate files
- **Rename** - Change file names with patterns
- **Tag** - Add metadata tags
- **Extract** - Pull text content
- **Summarize** - Generate summaries (needs AI)
- **Notify** - Show desktop notifications

## Example: Organize Downloads

\`\`\`
Name: Organize Downloads
Trigger: File Created in Downloads folder
Steps:
  1. Filter: Only PDF files
  2. Move: To Documents/PDFs
  3. Notify: "PDF organized"
\`\`\`

## Safety Features

- **Preview Mode** - See what will happen before running
- **Undo** - Reverse file operations
- **Approval Queue** - Non-manual triggers need approval
- **Limits** - Maximum concurrent automations
    `.trim(),
    keywords: ['automation', 'workflow', 'trigger', 'organize', 'files'],
    relatedTopics: ['automation-permissions', 'trust-dashboard', 'preview-mode'],
    lastUpdated: '2024-01-15',
  },
  
  {
    id: 'automation-permissions',
    title: 'Automation Permissions',
    category: 'automation',
    shortDescription: 'Control what each automation can do.',
    content: `
# Automation Permissions

Every automation has its own permission settings.

## Per-Automation Controls

- **Enable/Disable** - Turn individual automations on/off
- **Require Approval** - Must confirm before running
- **Allowed Actions** - Restrict what steps can execute
- **Blocked Paths** - Folders the automation cannot access

## Default Behavior

- New automations start with **Manual** trigger
- Non-manual triggers require explicit approval
- System folders are protected by default

## Setting Permissions

1. Open Trust Dashboard
2. Find "Automation Permissions" section
3. Click an automation to expand settings
4. Toggle options as needed

## Best Practices

1. Start with manual triggers until you trust an automation
2. Use blocked paths to protect sensitive folders
3. Enable approval for automations that modify files
4. Review audit logs regularly
    `.trim(),
    keywords: ['permissions', 'security', 'control', 'access'],
    relatedTopics: ['first-automation', 'trust-dashboard', 'preview-mode'],
    lastUpdated: '2024-01-15',
  },
  
  // Learning
  {
    id: 'learning-privacy',
    title: 'Learning & Privacy',
    category: 'learning',
    shortDescription: 'How Dex learns while respecting your privacy.',
    content: `
# Learning & Privacy

Dex can learn from your work patterns to provide smart suggestions.

## What Dex Can Learn

### Work Patterns (Default: ON)
- Which apps you use together
- Common file access sequences
- Typical project structures

### Timing Data (Default: ON)
- When you're most productive
- Common break patterns
- Peak focus hours

### Context Data (Default: OFF)
- Document content analysis
- More accurate suggestions
- Higher privacy sensitivity

## Privacy Guarantees

1. **Local Only** - All learning data stays on your machine
2. **No Upload** - Nothing is sent to any server
3. **You Control It** - Toggle each type on/off
4. **Delete Anytime** - Clear all learning data instantly
5. **Time Limited** - Data auto-deletes after retention period

## Managing Learning

### In Trust Dashboard:
- Toggle collection types on/off
- Set retention period (default: 90 days)
- Enable/disable suggestions
- Clear all data

### Data Limits
- Maximum 10,000 data points
- Automatic cleanup when limit reached
- Oldest data removed first
    `.trim(),
    keywords: ['learning', 'privacy', 'patterns', 'suggestions', 'data'],
    relatedTopics: ['trust-dashboard', 'what-is-dex', 'smart-suggestions'],
    lastUpdated: '2024-01-15',
  },
  
  // Storage
  {
    id: 'storage-management',
    title: 'Storage Management',
    category: 'storage',
    shortDescription: 'How Dex manages system data efficiently.',
    content: `
# Storage Management

Dex uses a structured storage system with automatic cleanup.

## Storage Categories

- **Notes** - Your text notes and processed content
- **Automations** - Workflow definitions
- **Logs** - System and audit logs
- **Learning** - Pattern data
- **Cache** - Temporary data
- **Metadata** - File indexes and tags

## Storage Limits

Default: **500 MB** total

When limit is approached:
1. Warning shown at 70%
2. Auto-cleanup triggers at 90%
3. Old cache and logs cleaned first

## Retention Periods

- **Logs**: 30 days
- **Cache**: 7 days
- **Learning**: 90 days (configurable)

## Metadata Only

For file indexing, Dex stores **metadata only**:
- File path, name, size
- Tags and categories
- Last accessed time

The actual files stay in their original locations.

## Manual Cleanup

1. Open Settings
2. Go to Storage
3. Click "Clean Now"
4. Choose what to remove
    `.trim(),
    keywords: ['storage', 'disk', 'cleanup', 'space', 'limits'],
    relatedTopics: ['trust-dashboard', 'what-is-dex'],
    lastUpdated: '2024-01-15',
  },
  
  // Audio
  {
    id: 'voice-notes',
    title: 'Voice Notes & Transcription',
    category: 'audio',
    shortDescription: 'Record, transcribe, and organize voice notes.',
    content: `
# Voice Notes & Transcription

Turn voice recordings into actionable notes.

## Recording Options

1. **Quick Record** - Start/stop with hotkey
2. **Import** - Load existing audio files

Supported formats: MP3, WAV, M4A, OGG, WebM

## Transcription

### API-Based (Recommended)
- Connect your own API (OpenAI Whisper, etc.)
- You provide the API key
- Better accuracy

### Local (Experimental)
- No API needed
- Lower accuracy
- Works offline

## Workflow

1. Record or import audio
2. Choose to transcribe
3. Review and edit transcription
4. Generate summary (optional)
5. Link to files or projects

## Privacy Note

- Recordings stored locally
- API transcription sends audio to provider
- You choose when to transcribe
- Original audio preserved
    `.trim(),
    keywords: ['voice', 'audio', 'recording', 'transcription', 'speech'],
    relatedTopics: ['processing-pipeline', 'what-is-dex'],
    lastUpdated: '2024-01-15',
  },
  
  // Troubleshooting
  {
    id: 'common-issues',
    title: 'Common Issues',
    category: 'troubleshooting',
    shortDescription: 'Solutions for frequent problems.',
    content: `
# Common Issues

## Automations Not Running

**Check:**
1. Is automation system enabled? (Trust Dashboard)
2. Is the specific automation enabled?
3. Does it need approval? (Check pending queue)
4. Is trigger configured correctly?

**Fix:** Enable system, approve pending, check trigger path.

## Learning Not Working

**Check:**
1. Is learning enabled globally?
2. Is the specific data type enabled?
3. Has data limit been reached?

**Fix:** Enable in Trust Dashboard, clear old data if needed.

## High Storage Usage

**Check:**
1. Large audio recordings?
2. Many processed files?
3. Old logs accumulating?

**Fix:** Run manual cleanup, adjust retention periods.

## Slow Performance

**Check:**
1. Too many concurrent automations?
2. Large files being processed?
3. Background tasks running?

**Fix:** Reduce concurrent limits, process smaller batches.

## Emergency Recovery

If something goes wrong:
1. Use **Emergency Stop** in Trust Dashboard
2. Check audit logs for what happened
3. Disable problematic automation
4. Contact support if needed
    `.trim(),
    keywords: ['help', 'issues', 'problems', 'troubleshooting', 'fix'],
    relatedTopics: ['trust-dashboard', 'automation-permissions'],
    lastUpdated: '2024-01-15',
  },
];

const CONTEXTUAL_HELP: Record<string, ContextualHelp> = {
  'automation-trigger': {
    featureId: 'automation-trigger',
    title: 'Automation Triggers',
    description: 'Triggers determine when an automation runs.',
    tips: [
      'Start with Manual triggers until you trust the automation',
      'File-based triggers watch specific folders',
      'Schedule triggers run at set times',
    ],
    learnMoreTopic: 'first-automation',
  },
  'learning-toggle': {
    featureId: 'learning-toggle',
    title: 'Learning System',
    description: 'Controls whether Dex collects work patterns.',
    tips: [
      'Learning happens locally - nothing is uploaded',
      'Disable to stop new pattern collection',
      'Existing data is preserved unless you clear it',
    ],
    learnMoreTopic: 'learning-privacy',
  },
  'storage-limit': {
    featureId: 'storage-limit',
    title: 'Storage Limits',
    description: 'Maximum disk space Dex can use for system data.',
    tips: [
      'Dex auto-cleans when approaching limits',
      'Old logs and cache are cleaned first',
      'Your files are never deleted automatically',
    ],
    learnMoreTopic: 'storage-management',
  },
  'emergency-stop': {
    featureId: 'emergency-stop',
    title: 'Emergency Stop',
    description: 'Immediately disables all automated features.',
    tips: [
      'Use if something unexpected is happening',
      'Automations and learning are paused',
      'Manual features still work',
      'Re-enable individually after investigating',
    ],
    learnMoreTopic: 'trust-dashboard',
  },
};

const QUICK_GUIDES: QuickGuide[] = [
  {
    id: 'setup-first-automation',
    title: 'Create Your First Automation',
    description: 'Set up a simple file organization workflow.',
    estimatedTime: '5 minutes',
    steps: [
      {
        title: 'Open Automation Panel',
        description: 'Navigate to the Automations section from the sidebar.',
      },
      {
        title: 'Click New Automation',
        description: 'Give your automation a descriptive name.',
      },
      {
        title: 'Choose Trigger',
        description: 'Start with "Manual" for testing, or "File Created" for automatic.',
      },
      {
        title: 'Add Steps',
        description: 'Add actions like Filter, Move, or Notify.',
      },
      {
        title: 'Test with Preview',
        description: 'Use Preview to see what will happen before running.',
      },
      {
        title: 'Save and Run',
        description: 'Save your automation and test it manually first.',
      },
    ],
  },
  {
    id: 'setup-transcription',
    title: 'Set Up Voice Transcription',
    description: 'Configure an API for transcribing voice notes.',
    estimatedTime: '3 minutes',
    steps: [
      {
        title: 'Open Audio Settings',
        description: 'Go to Settings > Audio > Transcription Providers.',
      },
      {
        title: 'Add Provider',
        description: 'Click "Add Provider" and choose your service.',
      },
      {
        title: 'Enter API Key',
        description: 'Paste your API key from the provider.',
      },
      {
        title: 'Test Connection',
        description: 'Click "Test" to verify the connection works.',
      },
      {
        title: 'Set as Active',
        description: 'Enable the provider and set as active.',
      },
    ],
  },
  {
    id: 'review-privacy',
    title: 'Review Privacy Settings',
    description: 'Understand and configure what data Dex collects.',
    estimatedTime: '2 minutes',
    steps: [
      {
        title: 'Open Trust Dashboard',
        description: 'Click the Shield icon in the sidebar.',
      },
      {
        title: 'Review Learning Settings',
        description: 'Expand "Learning Settings" to see data collection toggles.',
      },
      {
        title: 'Adjust as Needed',
        description: 'Toggle off any collection types you don\'t want.',
      },
      {
        title: 'Check Audit Log',
        description: 'Review recent activity to see what Dex has done.',
      },
    ],
  },
];

// ===========================================================================
// Help System
// ===========================================================================

class InAppHelpSystem {
  private mainWindow: BrowserWindow | null = null;

  constructor() {
    this.registerIPCHandlers();
  }

  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window;
  }

  // Topics
  getAllTopics(): HelpTopic[] {
    return HELP_TOPICS;
  }

  getTopicsByCategory(category: HelpCategory): HelpTopic[] {
    return HELP_TOPICS.filter(t => t.category === category);
  }

  getTopic(id: string): HelpTopic | null {
    return HELP_TOPICS.find(t => t.id === id) || null;
  }

  searchTopics(query: string): HelpTopic[] {
    const lower = query.toLowerCase();
    return HELP_TOPICS.filter(topic => 
      topic.title.toLowerCase().includes(lower) ||
      topic.shortDescription.toLowerCase().includes(lower) ||
      topic.keywords.some(k => k.toLowerCase().includes(lower)) ||
      topic.content.toLowerCase().includes(lower)
    );
  }

  // Contextual Help
  getContextualHelp(featureId: string): ContextualHelp | null {
    return CONTEXTUAL_HELP[featureId] || null;
  }

  // Quick Guides
  getAllGuides(): QuickGuide[] {
    return QUICK_GUIDES;
  }

  getGuide(id: string): QuickGuide | null {
    return QUICK_GUIDES.find(g => g.id === id) || null;
  }

  // Categories
  getCategories(): { id: HelpCategory; name: string; count: number }[] {
    const categories: { id: HelpCategory; name: string }[] = [
      { id: 'getting-started', name: 'Getting Started' },
      { id: 'automation', name: 'Automation' },
      { id: 'learning', name: 'Learning & Patterns' },
      { id: 'storage', name: 'Storage' },
      { id: 'audio', name: 'Audio & Voice' },
      { id: 'security', name: 'Security' },
      { id: 'governance', name: 'Trust & Control' },
      { id: 'troubleshooting', name: 'Troubleshooting' },
    ];

    return categories.map(c => ({
      ...c,
      count: HELP_TOPICS.filter(t => t.category === c.id).length,
    }));
  }

  // IPC
  private registerIPCHandlers(): void {
    ipcMain.handle('help:getAllTopics', () => this.getAllTopics());
    ipcMain.handle('help:getTopicsByCategory', (_, category) => 
      this.getTopicsByCategory(category)
    );
    ipcMain.handle('help:getTopic', (_, id) => this.getTopic(id));
    ipcMain.handle('help:searchTopics', (_, query) => this.searchTopics(query));
    ipcMain.handle('help:getContextualHelp', (_, featureId) => 
      this.getContextualHelp(featureId)
    );
    ipcMain.handle('help:getAllGuides', () => this.getAllGuides());
    ipcMain.handle('help:getGuide', (_, id) => this.getGuide(id));
    ipcMain.handle('help:getCategories', () => this.getCategories());
  }
}

// ===========================================================================
// Export
// ===========================================================================

export const helpSystem = new InAppHelpSystem();
export default helpSystem;
