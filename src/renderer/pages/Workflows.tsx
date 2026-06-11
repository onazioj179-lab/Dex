// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * WORKFLOWS - macOS Shortcuts Style Automation Builder
 * Visual node-based workflow editor with canvas, connections, and execution
 */

import React, { useState, useMemo, useEffect, useCallback, useRef, memo } from 'react';
import { useAppTracking } from '../services/usePatternLearning';
import { glassSidebar } from '../styles/glassMenu';
import { useToastHelpers } from '../components/Toast';
import ContextMenu, { useContextMenu, ContextMenuItem } from '../components/ContextMenu';
import DexIcon from '../components/DexIcon';

// ===========================================================================
// TYPES
// ===========================================================================

interface WorkflowNode {
  id: string;
  actionId: string;
  name: string;
  category: string;
  x: number;
  y: number;
  config: Record<string, string>;
}

interface WorkflowConnection {
  from: string; // node id
  to: string;   // node id
}

interface Workflow {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  steps: number;
  lastRun: Date | null;
  nodes?: WorkflowNode[];
  connections?: WorkflowConnection[];
}

interface ActionBlock {
  id: string;
  name: string;
  category: string;
  description: string;
  configFields?: { key: string; label: string; type: 'text' | 'select' | 'number'; options?: string[] }[];
}

// ===========================================================================
// ICONS (SVG only, no emoji)
// ===========================================================================

const Icons = {
  play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z"/>
    </svg>
  ),
  plus: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14"/>
    </svg>
  ),
  edit: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  ),
  trash: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
    </svg>
  ),
  grid: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
    </svg>
  ),
  bolt: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  file: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
      <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  ),
  clock: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
    </svg>
  ),
  send: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
    </svg>
  ),
  folder: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
    </svg>
  ),
  code: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 18l6-6-6-6M8 6l-6 6 6 6"/>
    </svg>
  ),
  note: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  ),
  timer: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M5 3l-2 2M19 3l2 2"/>
    </svg>
  ),
  app: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  condition: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>
    </svg>
  ),
  loop: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
    </svg>
  ),
  template: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
    </svg>
  ),
  config: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
    </svg>
  ),
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Files: Icons.file,
  Notes: Icons.note,
  Communication: Icons.send,
  Control: Icons.condition,
  Scripting: Icons.code,
  Apps: Icons.app,
  Media: Icons.play,
  System: Icons.config,
  Web: Icons.loop,
  Text: Icons.note,
  Data: Icons.file,
};

// ===========================================================================
// ACTION CATALOG
// ===========================================================================

const ACTION_BLOCKS: ActionBlock[] = [
  // Files (12 actions)
  { id: 'a1', name: 'Get Files', category: 'Files', description: 'Get files from a folder',
    configFields: [{ key: 'path', label: 'Folder Path', type: 'text' }, { key: 'filter', label: 'File Filter', type: 'text' }] },
  { id: 'a2', name: 'Copy File', category: 'Files', description: 'Copy file to destination',
    configFields: [{ key: 'source', label: 'Source', type: 'text' }, { key: 'dest', label: 'Destination', type: 'text' }] },
  { id: 'a3', name: 'Move File', category: 'Files', description: 'Move file to folder',
    configFields: [{ key: 'source', label: 'Source', type: 'text' }, { key: 'dest', label: 'Destination', type: 'text' }] },
  { id: 'a11', name: 'Delete File', category: 'Files', description: 'Delete a file',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }] },
  { id: 'a12', name: 'Rename File', category: 'Files', description: 'Rename a file',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }, { key: 'newName', label: 'New Name', type: 'text' }] },
  { id: 'a13', name: 'Create Folder', category: 'Files', description: 'Create a new directory',
    configFields: [{ key: 'path', label: 'Folder Path', type: 'text' }] },
  { id: 'a14', name: 'Zip Files', category: 'Files', description: 'Compress files into archive',
    configFields: [{ key: 'source', label: 'Source Path', type: 'text' }, { key: 'dest', label: 'Archive Path', type: 'text' }] },
  { id: 'a15', name: 'Unzip Files', category: 'Files', description: 'Extract archive contents',
    configFields: [{ key: 'archive', label: 'Archive Path', type: 'text' }, { key: 'dest', label: 'Destination', type: 'text' }] },
  { id: 'a16', name: 'Read File', category: 'Files', description: 'Read file contents to variable',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }] },
  { id: 'a17', name: 'Write File', category: 'Files', description: 'Write content to a file',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }, { key: 'content', label: 'Content', type: 'text' }] },
  { id: 'a18', name: 'Watch Folder', category: 'Files', description: 'Trigger on file changes',
    configFields: [{ key: 'path', label: 'Folder Path', type: 'text' }, { key: 'event', label: 'Event', type: 'select', options: ['created', 'modified', 'deleted'] }] },
  { id: 'a19', name: 'File Info', category: 'Files', description: 'Get file size, date, type',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }] },

  // Notes (4 actions)
  { id: 'a4', name: 'Create Note', category: 'Notes', description: 'Create a new note',
    configFields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'content', label: 'Content', type: 'text' }] },
  { id: 'a20', name: 'Append to Note', category: 'Notes', description: 'Add text to existing note',
    configFields: [{ key: 'title', label: 'Note Title', type: 'text' }, { key: 'content', label: 'Text to Append', type: 'text' }] },
  { id: 'a21', name: 'Search Notes', category: 'Notes', description: 'Find notes matching query',
    configFields: [{ key: 'query', label: 'Search Query', type: 'text' }] },
  { id: 'a22', name: 'Export Note', category: 'Notes', description: 'Export note as Markdown',
    configFields: [{ key: 'title', label: 'Note Title', type: 'text' }, { key: 'dest', label: 'Destination Path', type: 'text' }] },

  // Communication (5 actions)
  { id: 'a5', name: 'Send Notification', category: 'Communication', description: 'Send a system notification',
    configFields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'body', label: 'Message', type: 'text' }] },
  { id: 'a23', name: 'Send Email', category: 'Communication', description: 'Send an email message',
    configFields: [{ key: 'to', label: 'To Address', type: 'text' }, { key: 'subject', label: 'Subject', type: 'text' }, { key: 'body', label: 'Body', type: 'text' }] },
  { id: 'a24', name: 'Clipboard Copy', category: 'Communication', description: 'Copy text to clipboard',
    configFields: [{ key: 'text', label: 'Text', type: 'text' }] },
  { id: 'a25', name: 'Show Dialog', category: 'Communication', description: 'Display a dialog box',
    configFields: [{ key: 'title', label: 'Title', type: 'text' }, { key: 'message', label: 'Message', type: 'text' }, { key: 'type', label: 'Type', type: 'select', options: ['info', 'warning', 'error', 'question'] }] },
  { id: 'a26', name: 'Play Sound', category: 'Communication', description: 'Play an alert sound',
    configFields: [{ key: 'sound', label: 'Sound', type: 'select', options: ['default', 'ping', 'pop', 'hero', 'glass'] }] },

  // Control (7 actions)
  { id: 'a6', name: 'Wait', category: 'Control', description: 'Pause for a duration',
    configFields: [{ key: 'seconds', label: 'Seconds', type: 'number' }] },
  { id: 'a9', name: 'Condition', category: 'Control', description: 'Branch based on a condition',
    configFields: [{ key: 'variable', label: 'Variable', type: 'text' }, { key: 'operator', label: 'Operator', type: 'select', options: ['equals', 'not equals', 'contains', 'greater than', 'less than'] }, { key: 'value', label: 'Value', type: 'text' }] },
  { id: 'a10', name: 'Loop', category: 'Control', description: 'Repeat actions N times',
    configFields: [{ key: 'count', label: 'Iterations', type: 'number' }] },
  { id: 'a27', name: 'For Each', category: 'Control', description: 'Iterate over a list of items',
    configFields: [{ key: 'variable', label: 'List Variable', type: 'text' }] },
  { id: 'a28', name: 'Stop Workflow', category: 'Control', description: 'Halt workflow execution',
    configFields: [] },
  { id: 'a29', name: 'Set Variable', category: 'Control', description: 'Store a value in a variable',
    configFields: [{ key: 'name', label: 'Variable Name', type: 'text' }, { key: 'value', label: 'Value', type: 'text' }] },
  { id: 'a30', name: 'Try/Catch', category: 'Control', description: 'Handle errors gracefully',
    configFields: [{ key: 'onError', label: 'On Error', type: 'select', options: ['continue', 'retry', 'stop'] }] },

  // Scripting (5 actions)
  { id: 'a7', name: 'Run Script', category: 'Scripting', description: 'Execute a custom script',
    configFields: [{ key: 'language', label: 'Language', type: 'select', options: ['JavaScript', 'Python', 'PowerShell', 'Bash'] }, { key: 'code', label: 'Script', type: 'text' }] },
  { id: 'a31', name: 'Evaluate Expression', category: 'Scripting', description: 'Evaluate a math or string expression',
    configFields: [{ key: 'expression', label: 'Expression', type: 'text' }] },
  { id: 'a32', name: 'Regular Expression', category: 'Scripting', description: 'Match or replace using regex',
    configFields: [{ key: 'input', label: 'Input', type: 'text' }, { key: 'pattern', label: 'Pattern', type: 'text' }, { key: 'replace', label: 'Replace With', type: 'text' }] },
  { id: 'a33', name: 'JSON Parse', category: 'Scripting', description: 'Parse JSON string to object',
    configFields: [{ key: 'input', label: 'JSON String', type: 'text' }] },
  { id: 'a34', name: 'JSON Stringify', category: 'Scripting', description: 'Convert object to JSON string',
    configFields: [{ key: 'variable', label: 'Variable Name', type: 'text' }] },

  // Apps (5 actions)
  { id: 'a8', name: 'Open App', category: 'Apps', description: 'Launch an application',
    configFields: [{ key: 'appName', label: 'App Name', type: 'text' }] },
  { id: 'a35', name: 'Open URL', category: 'Apps', description: 'Open a URL in browser',
    configFields: [{ key: 'url', label: 'URL', type: 'text' }] },
  { id: 'a36', name: 'Open File', category: 'Apps', description: 'Open file with default app',
    configFields: [{ key: 'path', label: 'File Path', type: 'text' }] },
  { id: 'a37', name: 'Close App', category: 'Apps', description: 'Close a running application',
    configFields: [{ key: 'appName', label: 'App Name', type: 'text' }] },
  { id: 'a38', name: 'Switch to App', category: 'Apps', description: 'Bring app to foreground',
    configFields: [{ key: 'appName', label: 'App Name', type: 'text' }] },

  // Media (6 actions)
  { id: 'a39', name: 'Resize Image', category: 'Media', description: 'Resize an image file',
    configFields: [{ key: 'source', label: 'Image Path', type: 'text' }, { key: 'width', label: 'Width', type: 'number' }, { key: 'height', label: 'Height', type: 'number' }] },
  { id: 'a40', name: 'Convert Image', category: 'Media', description: 'Convert image format',
    configFields: [{ key: 'source', label: 'Source', type: 'text' }, { key: 'format', label: 'Format', type: 'select', options: ['png', 'jpg', 'webp', 'avif'] }] },
  { id: 'a41', name: 'Extract Audio', category: 'Media', description: 'Extract audio from video',
    configFields: [{ key: 'source', label: 'Video Path', type: 'text' }, { key: 'dest', label: 'Output Path', type: 'text' }] },
  { id: 'a42', name: 'Create Thumbnail', category: 'Media', description: 'Generate image thumbnail',
    configFields: [{ key: 'source', label: 'Image Path', type: 'text' }, { key: 'size', label: 'Max Size', type: 'number' }] },
  { id: 'a43', name: 'Watermark Image', category: 'Media', description: 'Add watermark to image',
    configFields: [{ key: 'source', label: 'Image Path', type: 'text' }, { key: 'text', label: 'Watermark Text', type: 'text' }] },
  { id: 'a44', name: 'Trim Video', category: 'Media', description: 'Cut video to time range',
    configFields: [{ key: 'source', label: 'Video Path', type: 'text' }, { key: 'start', label: 'Start Time (s)', type: 'number' }, { key: 'end', label: 'End Time (s)', type: 'number' }] },

  // System (5 actions)
  { id: 'a45', name: 'Get System Info', category: 'System', description: 'Get CPU, memory, disk info',
    configFields: [] },
  { id: 'a46', name: 'Set Power Profile', category: 'System', description: 'Switch power management mode',
    configFields: [{ key: 'profile', label: 'Profile', type: 'select', options: ['balanced', 'performance', 'powersaver'] }] },
  { id: 'a47', name: 'Kill Process', category: 'System', description: 'Terminate a running process',
    configFields: [{ key: 'name', label: 'Process Name', type: 'text' }] },
  { id: 'a48', name: 'Schedule Task', category: 'System', description: 'Run at a scheduled time',
    configFields: [{ key: 'time', label: 'Time (HH:MM)', type: 'text' }, { key: 'repeat', label: 'Repeat', type: 'select', options: ['once', 'daily', 'weekly'] }] },
  { id: 'a49', name: 'Empty Trash', category: 'System', description: 'Empty the system recycle bin',
    configFields: [] },

  // Web (4 actions)
  { id: 'a50', name: 'HTTP Request', category: 'Web', description: 'Make an HTTP/API request',
    configFields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'method', label: 'Method', type: 'select', options: ['GET', 'POST', 'PUT', 'DELETE'] }] },
  { id: 'a51', name: 'Download File', category: 'Web', description: 'Download file from URL',
    configFields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'dest', label: 'Save Path', type: 'text' }] },
  { id: 'a52', name: 'RSS Feed', category: 'Web', description: 'Fetch and parse an RSS feed',
    configFields: [{ key: 'url', label: 'Feed URL', type: 'text' }] },
  { id: 'a53', name: 'Web Scrape', category: 'Web', description: 'Extract data from a webpage',
    configFields: [{ key: 'url', label: 'URL', type: 'text' }, { key: 'selector', label: 'CSS Selector', type: 'text' }] },

  // Text (4 actions)
  { id: 'a54', name: 'Find & Replace', category: 'Text', description: 'Replace text in a string',
    configFields: [{ key: 'find', label: 'Find', type: 'text' }, { key: 'replace', label: 'Replace', type: 'text' }] },
  { id: 'a55', name: 'Split Text', category: 'Text', description: 'Split text by delimiter',
    configFields: [{ key: 'delimiter', label: 'Delimiter', type: 'text' }] },
  { id: 'a56', name: 'Join Text', category: 'Text', description: 'Combine list into text',
    configFields: [{ key: 'separator', label: 'Separator', type: 'text' }] },
  { id: 'a57', name: 'Format Date', category: 'Text', description: 'Format a date/time value',
    configFields: [{ key: 'format', label: 'Format', type: 'select', options: ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD.MM.YYYY', 'ISO 8601'] }] },

  // Data (3 actions)
  { id: 'a58', name: 'Sort List', category: 'Data', description: 'Sort a list of items',
    configFields: [{ key: 'order', label: 'Order', type: 'select', options: ['ascending', 'descending'] }] },
  { id: 'a59', name: 'Filter List', category: 'Data', description: 'Remove items not matching criteria',
    configFields: [{ key: 'operator', label: 'Operator', type: 'select', options: ['contains', 'starts with', 'ends with', 'matches regex'] }, { key: 'value', label: 'Value', type: 'text' }] },
  { id: 'a60', name: 'Count Items', category: 'Data', description: 'Count items in a list',
    configFields: [] },
];

const WORKFLOW_TEMPLATES: { name: string; description: string; nodes: WorkflowNode[]; connections: WorkflowConnection[] }[] = [
  {
    name: 'File Backup',
    description: 'Copy files from source to backup folder',
    nodes: [
      { id: 't1n1', actionId: 'a1', name: 'Get Files', category: 'Files', x: 80, y: 60, config: { path: '/documents', filter: '*' } },
      { id: 't1n2', actionId: 'a2', name: 'Copy File', category: 'Files', x: 80, y: 200, config: { source: '{input}', dest: '/backup' } },
      { id: 't1n3', actionId: 'a5', name: 'Send Message', category: 'Communication', x: 80, y: 340, config: { title: 'Backup Complete', body: 'Files backed up successfully' } },
    ],
    connections: [{ from: 't1n1', to: 't1n2' }, { from: 't1n2', to: 't1n3' }],
  },
  {
    name: 'Scheduled Script',
    description: 'Run a script after a delay',
    nodes: [
      { id: 't2n1', actionId: 'a6', name: 'Wait', category: 'Control', x: 80, y: 60, config: { seconds: '30' } },
      { id: 't2n2', actionId: 'a7', name: 'Run Script', category: 'Scripting', x: 80, y: 200, config: { language: 'JavaScript', code: 'console.log("done")' } },
    ],
    connections: [{ from: 't2n1', to: 't2n2' }],
  },
  {
    name: 'Organize Files',
    description: 'Get, filter, and move files to categories',
    nodes: [
      { id: 't3n1', actionId: 'a1', name: 'Get Files', category: 'Files', x: 80, y: 60, config: { path: '/downloads', filter: '*.pdf' } },
      { id: 't3n2', actionId: 'a3', name: 'Move File', category: 'Files', x: 80, y: 200, config: { source: '{input}', dest: '/documents/pdfs' } },
      { id: 't3n3', actionId: 'a5', name: 'Send Message', category: 'Communication', x: 80, y: 340, config: { title: 'Files Organized', body: 'PDFs moved to documents/pdfs' } },
    ],
    connections: [{ from: 't3n1', to: 't3n2' }, { from: 't3n2', to: 't3n3' }],
  },
];

// ===========================================================================
// PERSISTENCE (IPC + localStorage fallback)
// ===========================================================================

const loadWorkflows = async (): Promise<Workflow[]> => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.getAll) {
      const remote = await dex.workflows.getAll();
      if (Array.isArray(remote) && remote.length > 0) {
        return remote.map((w: any) => ({ ...w, lastRun: w.lastRun ? new Date(w.lastRun) : null }));
      }
    }
  } catch { /* IPC unavailable */ }
  try {
    const saved = localStorage.getItem('dex-workflows');
    if (saved) {
      const parsed = JSON.parse(saved);
      return parsed.map((w: any) => ({ ...w, lastRun: w.lastRun ? new Date(w.lastRun) : null }));
    }
  } catch { /* localStorage unavailable */ }
  return [];
};

const saveWorkflow = async (workflow: Workflow) => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.save) { await dex.workflows.save(workflow); return; }
  } catch { /* IPC unavailable */ }
  try {
    const saved = localStorage.getItem('dex-workflows');
    const all: Workflow[] = saved ? JSON.parse(saved) : [];
    const idx = all.findIndex(w => w.id === workflow.id);
    if (idx >= 0) all[idx] = workflow; else all.unshift(workflow);
    localStorage.setItem('dex-workflows', JSON.stringify(all));
  } catch { /* ignore */ }
};

const deleteWorkflowIPC = async (id: string) => {
  try {
    const dex = window.dex;
    if (dex?.workflows?.delete) { await dex.workflows.delete(id); return; }
  } catch { /* IPC unavailable */ }
  try {
    const saved = localStorage.getItem('dex-workflows');
    if (saved) {
      const all: Workflow[] = JSON.parse(saved);
      localStorage.setItem('dex-workflows', JSON.stringify(all.filter(w => w.id !== id)));
    }
  } catch { /* ignore */ }
};

// ===========================================================================
// NODE COMPONENT
// ===========================================================================

const NODE_WIDTH = 220;
const NODE_HEIGHT = 72;
const CONNECTOR_R = 6;

const WorkflowNodeCard: React.FC<{
  node: WorkflowNode;
  selected: boolean;
  executing: boolean;
  executionDone: boolean;
  onSelect: () => void;
  onDragStart: (e: React.MouseEvent) => void;
  onConnectStart: (e: React.MouseEvent) => void;
}> = ({ node, selected, executing, executionDone, onSelect, onDragStart, onConnectStart }) => {
  const catIcon = CATEGORY_ICONS[node.category] || Icons.bolt;
  const borderColor = executionDone ? 'var(--color-success)' : executing ? 'var(--color-accent)' : selected ? 'var(--color-accent)' : 'var(--color-border-subtle)';

  return (
    <g>
      <foreignObject x={node.x} y={node.y} width={NODE_WIDTH} height={NODE_HEIGHT}>
        <div
          onMouseDown={(e) => { e.stopPropagation(); onSelect(); onDragStart(e); }}
          style={{
            width: NODE_WIDTH, height: NODE_HEIGHT, borderRadius: 10,
            background: 'var(--color-bg-elevated)',
            border: `1.5px solid ${borderColor}`,
            display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px',
            cursor: 'grab', userSelect: 'none',
            boxShadow: selected ? '0 0 0 2px rgba(10,132,255,0.25)' : 'none',
          }}
        >
          <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--color-bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', flexShrink: 0 }}>
            {catIcon}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{node.name}</div>
            <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{node.category}</div>
          </div>
          {executing && (
            <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #0a84ff', borderTopColor: 'transparent' }} />
          )}
          {executionDone && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#30d158" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          )}
        </div>
      </foreignObject>
      {/* Input connector (top center) */}
      <circle cx={node.x + NODE_WIDTH / 2} cy={node.y} r={CONNECTOR_R} fill="var(--color-border)" stroke="var(--color-text-tertiary)" strokeWidth="1" style={{ cursor: 'crosshair' }} />
      {/* Output connector (bottom center) */}
      <circle
        cx={node.x + NODE_WIDTH / 2} cy={node.y + NODE_HEIGHT} r={CONNECTOR_R}
        fill="var(--color-accent)" stroke="rgba(10,132,255,0.5)" strokeWidth="1"
        style={{ cursor: 'crosshair' }}
        onMouseDown={(e) => { e.stopPropagation(); onConnectStart(e); }}
      />
    </g>
  );
};

// ===========================================================================
// MAIN COMPONENT
// ===========================================================================

export const Workflows: React.FC = () => {
  useAppTracking('workflows');

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);

  // Editor state
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [connections, setConnections] = useState<WorkflowConnection[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  const [connectingMouse, setConnectingMouse] = useState({ x: 0, y: 0 });
  const [executingNodes, setExecutingNodes] = useState<Set<string>>(new Set());
  const [executedNodes, setExecutedNodes] = useState<Set<string>>(new Set());
  const [isRunning, setIsRunning] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [actionSearch, setActionSearch] = useState('');
  const canvasRef = useRef<SVGSVGElement>(null);
  const dragRafRef = useRef<number>(0);

  // Load workflows
  useEffect(() => {
    let cancelled = false;
    loadWorkflows().then(loaded => {
      if (!cancelled) { setWorkflows(loaded); setLoading(false); }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filteredWorkflows = useMemo(() => workflows.filter(w =>
    w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    w.description.toLowerCase().includes(searchQuery.toLowerCase())
  ), [workflows, searchQuery]);

  const filteredActions = useMemo(() => {
    if (!actionSearch) return ACTION_BLOCKS;
    const q = actionSearch.toLowerCase();
    return ACTION_BLOCKS.filter(a => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q));
  }, [actionSearch]);

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);

  // ---- Workflow CRUD ----

  const toast = useToastHelpers();

  const runWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.map(w => w.id === id ? { ...w, lastRun: new Date() } : w));
    const dex = window.dex;
    if (dex?.workflows?.execute) {
      dex.workflows.execute(id).catch((err: unknown) => {
        toast.error(`Workflow failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      });
    }
  }, [toast]);

  const deleteWorkflow = useCallback((id: string) => {
    setWorkflows(prev => prev.filter(w => w.id !== id));
    deleteWorkflowIPC(id);
    if (selectedWorkflow?.id === id) setSelectedWorkflow(null);
  }, [selectedWorkflow]);

  const createWorkflow = useCallback(() => {
    const newWf: Workflow = {
      id: crypto.randomUUID(), name: 'New Shortcut', description: '',
      icon: 'W', color: 'var(--color-accent)', steps: 0, lastRun: null,
      nodes: [], connections: [],
    };
    setWorkflows(prev => [newWf, ...prev]);
    setSelectedWorkflow(newWf);
    setNodes([]);
    setConnections([]);
    setIsEditing(true);
    saveWorkflow(newWf);
    window.dispatchEvent(new CustomEvent('dex-stat-bump', { detail: { key: 'workflowsCreated', amount: 1 } }));
  }, []);

  const openEditor = useCallback((wf: Workflow) => {
    setSelectedWorkflow(wf);
    setNodes(wf.nodes || []);
    setConnections(wf.connections || []);
    setSelectedNodeId(null);
    setIsEditing(true);
  }, []);

  // Context menu
  const { menuState: ctxMenuState, show: showCtxMenu, close: closeCtxMenu } = useContextMenu();

  const buildWorkflowCtxItems = useCallback((wf: Workflow): ContextMenuItem[] => [
    { label: 'Run', icon: <DexIcon name="play" size={12} />, onClick: () => runWorkflow(wf.id) },
    { label: 'Edit', onClick: () => openEditor(wf), divider: true },
    { label: 'Duplicate', onClick: () => {
      const dup: Workflow = { ...wf, id: crypto.randomUUID(), name: wf.name + ' Copy' };
      setWorkflows(prev => [dup, ...prev]);
    }},
    { label: 'Delete', onClick: () => deleteWorkflow(wf.id), danger: true },
  ], [runWorkflow, openEditor, deleteWorkflow]);

  const saveCurrentWorkflow = useCallback(() => {
    if (!selectedWorkflow) return;
    const updated = { ...selectedWorkflow, nodes, connections, steps: nodes.length };
    setWorkflows(prev => prev.map(w => w.id === updated.id ? updated : w));
    setSelectedWorkflow(updated);
    saveWorkflow(updated);
  }, [selectedWorkflow, nodes, connections]);

  const applyTemplate = useCallback((tmpl: typeof WORKFLOW_TEMPLATES[0]) => {
    const idMap: Record<string, string> = {};
    const newNodes = tmpl.nodes.map(n => {
      const newId = `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      idMap[n.id] = newId;
      return { ...n, id: newId };
    });
    const newConns = tmpl.connections.map(c => ({ from: idMap[c.from], to: idMap[c.to] }));
    setNodes(newNodes);
    setConnections(newConns);
    setShowTemplates(false);
    if (selectedWorkflow) {
      setSelectedWorkflow(prev => prev ? { ...prev, name: tmpl.name, description: tmpl.description } : prev);
    }
  }, [selectedWorkflow]);

  // ---- Canvas interactions ----

  const addNodeFromAction = useCallback((action: ActionBlock) => {
    const newNode: WorkflowNode = {
      id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      actionId: action.id, name: action.name, category: action.category,
      x: 80 + Math.random() * 100, y: 80 + nodes.length * 120,
      config: {},
    };
    setNodes(prev => [...prev, newNode]);
    setSelectedNodeId(newNode.id);
  }, [nodes.length]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragNodeId && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffset.x;
      const y = e.clientY - rect.top - dragOffset.y;
      if (dragRafRef.current) cancelAnimationFrame(dragRafRef.current);
      dragRafRef.current = requestAnimationFrame(() => {
        setNodes(prev => prev.map(n => n.id === dragNodeId ? { ...n, x: Math.max(0, x), y: Math.max(0, y) } : n));
      });
    }
    if (connectingFrom && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      setConnectingMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
  }, [dragNodeId, dragOffset, connectingFrom]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (connectingFrom && canvasRef.current) {
      // Check if we're over a node's input connector
      const rect = canvasRef.current.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      for (const node of nodes) {
        if (node.id === connectingFrom) continue;
        const cx = node.x + NODE_WIDTH / 2;
        const cy = node.y;
        const dist = Math.sqrt((mx - cx) ** 2 + (my - cy) ** 2);
        if (dist < 20) {
          // Prevent duplicate connections
          const exists = connections.some(c => c.from === connectingFrom && c.to === node.id);
          if (!exists) {
            setConnections(prev => [...prev, { from: connectingFrom, to: node.id }]);
          }
          break;
        }
      }
    }
    setDragNodeId(null);
    setConnectingFrom(null);
  }, [connectingFrom, nodes, connections]);

  const handleNodeDragStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    setDragNodeId(nodeId);
    setDragOffset({ x: e.clientX - rect.left - node.x, y: e.clientY - rect.top - node.y });
  }, [nodes]);

  const handleConnectStart = useCallback((nodeId: string, e: React.MouseEvent) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setConnectingFrom(nodeId);
    setConnectingMouse({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  const deleteNode = useCallback((nodeId: string) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
    setConnections(prev => prev.filter(c => c.from !== nodeId && c.to !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  }, [selectedNodeId]);

  const updateNodeConfig = useCallback((nodeId: string, key: string, value: string) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, config: { ...n.config, [key]: value } } : n));
  }, []);

  // ---- Execution engine with variable passing ----

  const executeWorkflow = useCallback(async () => {
    if (nodes.length === 0) return;
    setIsRunning(true);
    setExecutingNodes(new Set());
    setExecutedNodes(new Set());

    // Build execution order: topological sort
    const inDegree: Record<string, number> = {};
    const adj: Record<string, string[]> = {};
    nodes.forEach(n => { inDegree[n.id] = 0; adj[n.id] = []; });
    connections.forEach(c => { inDegree[c.to] = (inDegree[c.to] || 0) + 1; adj[c.from]?.push(c.to); });

    const queue: string[] = nodes.filter(n => inDegree[n.id] === 0).map(n => n.id);
    const order: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      order.push(id);
      for (const next of (adj[id] || [])) {
        inDegree[next]--;
        if (inDegree[next] === 0) queue.push(next);
      }
    }
    nodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id); });

    // Variable context for data passing between nodes
    const context: Record<string, any> = { files: [], result: null, output: '' };

    // Execute each node with real action logic
    for (const nodeId of order) {
      setExecutingNodes(new Set([nodeId]));
      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        try {
          switch (node.actionId) {
            case 'get-files': {
              const folder = node.config.folder || 'documents';
              if (window.electron?.invoke) {
                const res = await window.electron.invoke('files:list', folder);
                context.files = res?.files || [];
              }
              break;
            }
            case 'copy-file': {
              const src = node.config.source || context.files?.[0]?.path;
              const dest = node.config.destination || '';
              if (src && dest && window.electron?.invoke) {
                await window.electron.invoke('files:copy', src, dest);
              }
              break;
            }
            case 'move-file': {
              const src = node.config.source || context.files?.[0]?.path;
              const dest = node.config.destination || '';
              if (src && dest && window.electron?.invoke) {
                await window.electron.invoke('files:move', src, dest);
              }
              break;
            }
            case 'delete-file': {
              const path = node.config.path || context.files?.[0]?.path;
              if (path && window.electron?.invoke) {
                await window.electron.invoke('files:delete', path);
              }
              break;
            }
            case 'rename-file': {
              const path = node.config.path || '';
              const newName = node.config.newName || '';
              if (path && newName && window.electron?.invoke) {
                await window.electron.invoke('files:rename', path, newName);
              }
              break;
            }
            case 'run-script': {
              const script = node.config.script || '';
              if (script && window.electron?.invoke) {
                const res = await window.electron.invoke('workflow:runScript', script);
                context.output = res?.output || '';
                context.result = res;
              }
              break;
            }
            case 'open-app': {
              const app = node.config.appName || '';
              if (app && window.electron?.invoke) {
                await window.electron.invoke('shell:openPath', app);
              }
              break;
            }
            case 'wait': {
              const ms = Math.min(parseInt(node.config.duration || '1000', 10), 30000);
              await new Promise(resolve => setTimeout(resolve, ms));
              break;
            }
            case 'condition': {
              const condVal = node.config.variable ? context[node.config.variable] : context.result;
              const condOp = node.config.operator || 'exists';
              const condMet = condOp === 'exists' ? !!condVal :
                              condOp === 'empty' ? !condVal :
                              condOp === 'equals' ? String(condVal) === node.config.value : true;
              context.conditionResult = condMet;
              break;
            }
            case 'loop': {
              // Loop sets iteration count in context
              context.loopCount = Math.min(parseInt(node.config.count || '1', 10), 100);
              break;
            }
            case 'create-note':
            case 'send-message':
            default:
              // Mark as handled -- these actions run server-side via IPC
              context[`${node.actionId}_dispatched`] = true;
              break;
          }
        } catch (err) {
          console.warn(`[Workflow] Node ${node.name} failed:`, err);
        }
      }

      // Brief visual pause for feedback
      await new Promise(resolve => setTimeout(resolve, 300));
      setExecutingNodes(new Set());
      setExecutedNodes(prev => new Set([...prev, nodeId]));
    }

    // Also run via IPC if available
    if (selectedWorkflow) {
      runWorkflow(selectedWorkflow.id);
    }

    setIsRunning(false);
  }, [nodes, connections, selectedWorkflow, runWorkflow]);

  const formatLastRun = (date: Date | null): string => {
    if (!date) return 'Never run';
    const diff = Date.now() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  // ===========================================================================
  // RENDER
  // ===========================================================================

  return (
    <>
    <div style={styles.container}>
      <style>{`
        button { font-family: inherit; transition: all 0.12s ease; }
        button:active { transform: scale(0.97); }
        * { scrollbar-width: thin; scrollbar-color: var(--color-border-subtle) transparent; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--color-border-subtle); border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: var(--color-border); }
        input:focus { outline: none; }
      `}</style>
      {/* Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Shortcuts</span>
        </div>
        <div style={styles.sidebarContent}>
          <button
            aria-label="View all shortcuts"
            style={{
              ...styles.sidebarItem,
              background: !isEditing && !selectedWorkflow ? 'var(--color-accent-muted)' : 'transparent',
              color: !isEditing && !selectedWorkflow ? 'var(--color-accent)' : 'var(--color-text-primary)',
            }}
            onClick={() => { setSelectedWorkflow(null); setIsEditing(false); }}
          >
            {Icons.grid}
            <span>All Shortcuts</span>
            <span style={styles.sidebarCount}>{workflows.length}</span>
          </button>

          <div style={styles.sectionLabel}>Categories</div>
          {['Files', 'Notes', 'Apps', 'Communication'].map(category => (
            <button key={category} aria-label={`Browse ${category} category`} style={styles.sidebarItem} onClick={() => { setSelectedWorkflow(null); setIsEditing(false); setSearchQuery(category); }}>
              {CATEGORY_ICONS[category] || Icons.folder}
              <span>{category}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div style={styles.main}>
        {!isEditing ? (
          <>
            {/* Header */}
            <div style={styles.header}>
              <div style={styles.headerLeft}>
                <h1 style={styles.title}>All Shortcuts</h1>
                <span style={styles.subtitle}>{workflows.length} shortcuts</span>
              </div>
              <div style={styles.headerRight}>
                <div style={styles.searchBox}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                  </svg>
                  <input type="text" placeholder="Search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={styles.searchInput} />
                </div>
                <button style={styles.createBtn} aria-label="Create new shortcut" onClick={createWorkflow}>
                  {Icons.plus}
                  <span>New Shortcut</span>
                </button>
              </div>
            </div>

            {/* Workflow Grid */}
            <div style={styles.workflowGrid}>
              {loading ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', fontSize: '14px', color: 'var(--color-text-muted)' }}>
                  Loading workflows...
                </div>
              ) : filteredWorkflows.length === 0 ? (
                <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center' as const }}>
                  <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transform: 'rotate(45deg)' }}>
                    <span style={{ transform: 'rotate(-45deg)', color: 'var(--color-text-muted)' }}><DexIcon name="zap" size={24} /></span>
                  </div>
                  <div style={{ fontSize: '18px', fontWeight: 600, marginTop: '16px', color: 'var(--color-text-primary)' }}>
                    {searchQuery ? 'No shortcuts found' : 'No shortcuts yet'}
                  </div>
                  <div style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    {searchQuery ? `No results for "${searchQuery}"` : 'Create your first shortcut to automate tasks'}
                  </div>
                  {!searchQuery && (
                    <button style={{ ...styles.createBtn, marginTop: '16px' }} onClick={createWorkflow}>
                      {Icons.plus} <span>New Shortcut</span>
                    </button>
                  )}
                </div>
              ) : (
                filteredWorkflows.map(workflow => (
                  <div key={workflow.id} onContextMenu={e => showCtxMenu(e, buildWorkflowCtxItems(workflow))} style={styles.workflowCard}>
                    <div style={styles.cardHeader}>
                      <div style={{ ...styles.cardIcon, background: `${workflow.color}20` }}>
                        {Icons.bolt}
                      </div>
                      <div style={styles.cardActions}>
                        <button style={styles.cardActionBtn} aria-label="Edit workflow" onClick={() => openEditor(workflow)}>{Icons.edit}</button>
                        <button style={{ ...styles.cardActionBtn, color: 'var(--color-error)' }} aria-label="Delete workflow" onClick={() => deleteWorkflow(workflow.id)}>{Icons.trash}</button>
                      </div>
                    </div>
                    <h3 style={styles.cardTitle}>{workflow.name}</h3>
                    <p style={styles.cardDescription}>{workflow.description || 'No description'}</p>
                    <div style={styles.cardFooter}>
                      <span style={styles.cardMeta}>{workflow.nodes?.length || workflow.steps || 0} steps {formatLastRun(workflow.lastRun)}</span>
                      <button style={{ ...styles.runBtn, background: `${workflow.color}22`, border: `1px solid ${workflow.color}40`, color: workflow.color }} aria-label="Run workflow" onClick={() => runWorkflow(workflow.id)}>
                        {Icons.play}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          /* ============================================================
             VISUAL EDITOR
             ============================================================ */
          <div style={styles.editor}>
            {/* Editor Header */}
            <div style={styles.editorHeader}>
              <button style={styles.backBtn} onClick={() => { saveCurrentWorkflow(); setIsEditing(false); }} aria-label="Go back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4, verticalAlign: 'middle' }}><path d="M19 12H5"/><polyline points="12 19 5 12 12 5"/></svg> Back
              </button>
              <input
                type="text" value={selectedWorkflow?.name || ''} placeholder="Workflow name"
                onChange={(e) => setSelectedWorkflow(prev => prev ? { ...prev, name: e.target.value } : prev)}
                style={styles.workflowNameInput}
              />
              <div style={styles.editorActions}>
                <button
                  style={{ ...styles.backBtn, color: 'var(--color-text-muted)' }}
                  onClick={() => setShowTemplates(!showTemplates)} aria-label="Templates"
                >
                  {Icons.template} Templates
                </button>
                <button
                  style={{ ...styles.runEditorBtn, opacity: isRunning || nodes.length === 0 ? 0.5 : 1 }}
                  onClick={executeWorkflow}
                  disabled={isRunning || nodes.length === 0}
                  aria-label="Run workflow"
                >
                  {Icons.play} Run
                </button>
                <button style={styles.saveBtn} aria-label="Save workflow" onClick={saveCurrentWorkflow}><DexIcon name="save" size={14} /> Save</button>
              </div>
            </div>

            {/* Templates Dropdown */}
            {showTemplates && (
              <div style={styles.templatesPanel}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', marginBottom: 12 }}>Templates</div>
                {WORKFLOW_TEMPLATES.map((tmpl, i) => (
                  <button
                    key={i}
                    style={styles.templateCard}
                    onClick={() => applyTemplate(tmpl)}
                    aria-label={`Apply template: ${tmpl.name}`}
                  >
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)' }}>{tmpl.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>{tmpl.description}</div>
                  </button>
                ))}
              </div>
            )}

            {/* Editor Content */}
            <div style={styles.editorContent}>
              {/* Canvas */}
              <div style={styles.canvasContainer}>
                {nodes.length === 0 ? (
                  <div style={styles.emptyEditor}>
                    <div style={{ width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', transform: 'rotate(45deg)' }}>
                      <span style={{ transform: 'rotate(-45deg)', color: 'var(--color-accent)' }}><DexIcon name="zap" size={24} /></span>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 600, marginTop: 16 }}>Add actions to build your workflow</span>
                    <span style={{ color: 'var(--color-text-muted)', fontSize: 13, marginTop: 4 }}>Click actions from the panel or use a template to start</span>
                  </div>
                ) : (
                  <svg
                    ref={canvasRef}
                    width="100%" height="100%"
                    style={{ position: 'absolute', inset: 0 }}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={() => { setDragNodeId(null); setConnectingFrom(null); }}
                    onClick={() => setSelectedNodeId(null)}
                  >
                    {/* Grid pattern */}
                    <defs>
                      <pattern id="wf-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                        <circle cx="10" cy="10" r="0.5" fill="var(--color-bg-hover)" />
                      </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#wf-grid)" />

                    {/* Connection lines */}
                    {connections.map((conn, i) => {
                      const fromNode = nodes.find(n => n.id === conn.from);
                      const toNode = nodes.find(n => n.id === conn.to);
                      if (!fromNode || !toNode) return null;
                      const x1 = fromNode.x + NODE_WIDTH / 2;
                      const y1 = fromNode.y + NODE_HEIGHT;
                      const x2 = toNode.x + NODE_WIDTH / 2;
                      const y2 = toNode.y;
                      const cy1 = y1 + Math.abs(y2 - y1) * 0.4;
                      const cy2 = y2 - Math.abs(y2 - y1) * 0.4;
                      const active = executingNodes.has(conn.from) || executingNodes.has(conn.to);
                      return (
                        <path
                          key={i}
                          d={`M ${x1} ${y1} C ${x1} ${cy1}, ${x2} ${cy2}, ${x2} ${y2}`}
                          fill="none"
                          stroke={active ? 'var(--color-accent)' : 'var(--color-border)'}
                          strokeWidth={active ? 2 : 1.5}
                          strokeDasharray={active ? '6 3' : 'none'}
                        />
                      );
                    })}

                    {/* Active connection line (while dragging) */}
                    {connectingFrom && (() => {
                      const fromNode = nodes.find(n => n.id === connectingFrom);
                      if (!fromNode) return null;
                      const x1 = fromNode.x + NODE_WIDTH / 2;
                      const y1 = fromNode.y + NODE_HEIGHT;
                      return (
                        <line x1={x1} y1={y1} x2={connectingMouse.x} y2={connectingMouse.y} stroke="var(--color-accent)" strokeWidth="1.5" strokeDasharray="6 3" />
                      );
                    })()}

                    {/* Nodes */}
                    {nodes.map(node => (
                      <WorkflowNodeCard
                        key={node.id}
                        node={node}
                        selected={selectedNodeId === node.id}
                        executing={executingNodes.has(node.id)}
                        executionDone={executedNodes.has(node.id)}
                        onSelect={() => setSelectedNodeId(node.id)}
                        onDragStart={(e) => handleNodeDragStart(node.id, e)}
                        onConnectStart={(e) => handleConnectStart(node.id, e)}
                      />
                    ))}
                  </svg>
                )}
              </div>

              {/* Right Panel: Action Library or Node Config */}
              <div style={styles.rightPanel}>
                {selectedNode ? (
                  /* Node Configuration */
                  <div style={styles.configPanel}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)' }}>Configure</div>
                      <button
                        style={{ background: 'transparent', border: 'none', color: 'var(--color-error)', cursor: 'pointer', padding: 4 }}
                        onClick={() => deleteNode(selectedNode.id)}
                        aria-label="Delete node"
                      >
                        {Icons.trash}
                      </button>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-text-primary)', marginBottom: 4 }}>{selectedNode.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 16 }}>{selectedNode.category}</div>
                    {ACTION_BLOCKS.find(a => a.id === selectedNode.actionId)?.configFields?.map(field => (
                      <div key={field.key} style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)', display: 'block', marginBottom: 4 }}>{field.label}</label>
                        {field.type === 'select' ? (
                          <select
                            value={selectedNode.config[field.key] || ''}
                            onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                            style={styles.configSelect}
                          >
                            <option value="">Select...</option>
                            {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type={field.type === 'number' ? 'number' : 'text'}
                            value={selectedNode.config[field.key] || ''}
                            onChange={e => updateNodeConfig(selectedNode.id, field.key, e.target.value)}
                            placeholder={field.label}
                            style={styles.configInput}
                          />
                        )}
                      </div>
                    )) || (
                      <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No configuration needed</div>
                    )}

                    {/* Connections info */}
                    <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--color-bg-hover)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>CONNECTIONS</div>
                      {connections.filter(c => c.from === selectedNode.id || c.to === selectedNode.id).map((c, i) => {
                        const otherNode = nodes.find(n => n.id === (c.from === selectedNode.id ? c.to : c.from));
                        return (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                            <span>{c.from === selectedNode.id ? 'To' : 'From'}: {otherNode?.name}</span>
                            <button
                              style={{ background: 'transparent', border: 'none', color: 'var(--color-text-tertiary)', cursor: 'pointer', fontSize: 11 }}
                              onClick={() => setConnections(prev => prev.filter((_, idx) => idx !== connections.indexOf(c)))}
                              aria-label="Remove connection"
                            >
                              Remove
                            </button>
                          </div>
                        );
                      })}
                      {connections.filter(c => c.from === selectedNode.id || c.to === selectedNode.id).length === 0 && (
                        <div style={{ fontSize: 12, color: 'var(--color-text-tertiary)' }}>No connections</div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Action Library */
                  <div style={styles.actionLibrary}>
                    <div style={styles.libraryHeader}>
                      <span style={styles.libraryTitle}>Actions</span>
                    </div>
                    <div style={{ padding: '8px 8px 0' }}>
                      <div style={styles.actionSearchBox}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
                        </svg>
                        <input type="text" placeholder="Search actions..." value={actionSearch} onChange={e => setActionSearch(e.target.value)} style={styles.actionSearchInput} />
                      </div>
                    </div>
                    <div style={styles.actionList}>
                      {filteredActions.map(action => (
                        <button
                          key={action.id}
                          style={styles.actionItem}
                          onClick={() => addNodeFromAction(action)}
                          aria-label={`Add ${action.name} action`}
                        >
                          <span style={styles.actionIcon}>{CATEGORY_ICONS[action.category] || Icons.bolt}</span>
                          <div style={styles.actionInfo}>
                            <span style={styles.actionName}>{action.name}</span>
                            <span style={styles.actionDesc}>{action.description}</span>
                          </div>
                          <span style={{ color: 'var(--color-text-tertiary)' }}>{Icons.plus}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    {ctxMenuState && <ContextMenu items={ctxMenuState.items} position={ctxMenuState.position} onClose={closeCtxMenu} />}
    </>
  );
};

// ===========================================================================
// STYLES
// ===========================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%', height: '100%', display: 'flex',
    background: '#1C1C20',
    color: 'var(--color-text-primary)', fontFamily: 'var(--font-family)', fontSize: '13px', overflow: 'hidden',
  },
  sidebar: {
    width: '220px', ...glassSidebar,
    display: 'flex', flexDirection: 'column' as const,
  },
  sidebarHeader: {
    height: '32px', display: 'flex', alignItems: 'center', padding: '0 10px',
    borderBottom: '1px solid var(--color-border-subtle)',
  },
  sidebarTitle: { fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' },
  sidebarContent: { flex: 1, overflow: 'auto', padding: '8px' },
  sidebarItem: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '4px',
    border: 'none', cursor: 'pointer', fontSize: '13px', width: '100%', textAlign: 'left',
    background: 'transparent', color: 'var(--color-text-primary)',
  },
  sidebarCount: { marginLeft: 'auto', fontSize: '12px', color: 'var(--color-text-muted)' },
  sectionLabel: {
    fontSize: '11px', fontWeight: 600, color: 'var(--color-text-muted)',
    textTransform: 'uppercase', padding: '16px 12px 8px', letterSpacing: '0.5px',
  },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
    gap: 12, minWidth: 0,
  },
  headerLeft: { minWidth: 0 },
  headerRight: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '8px',
    minWidth: 0, maxWidth: '100%', overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'thin',
  },
  title: { fontSize: '18px', fontWeight: 700, marginBottom: '2px' },
  subtitle: { fontSize: '12px', color: 'var(--color-text-muted)' },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
    background: 'var(--color-border-subtle)', borderRadius: '6px', color: 'var(--color-text-muted)',
    minWidth: 150, flexShrink: 0,
  },
  searchInput: {
    background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
    fontSize: '13px', outline: 'none', width: '150px', minWidth: 0,
  },
  createBtn: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '6px',
    border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-inverse)',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  workflowGrid: {
    flex: 1, overflow: 'auto', padding: '24px',
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px', alignContent: 'start',
  },
  workflowCard: {
    background: 'var(--color-bg-elevated)', borderRadius: '6px', padding: '20px',
    display: 'flex', flexDirection: 'column', gap: '12px', minWidth: 0,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardIcon: {
    width: '48px', height: '48px', borderRadius: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)',
  },
  cardActions: { display: 'flex', gap: '4px' },
  cardActionBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '28px', height: '28px', borderRadius: '4px', border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-text-secondary)', cursor: 'pointer',
  },
  cardTitle: { fontSize: '16px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  cardDescription: { fontSize: '13px', color: 'var(--color-text-secondary)', lineHeight: 1.4, overflowWrap: 'anywhere' },
  cardFooter: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 'auto', paddingTop: '12px', borderTop: '1px solid var(--color-border-subtle)',
  },
  cardMeta: { fontSize: '12px', color: 'var(--color-text-muted)' },
  runBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', borderRadius: '50%', border: 'none',
    color: 'var(--color-text-primary)', cursor: 'pointer',
  },

  // Editor
  editor: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' as const, minWidth: 0 },
  editorHeader: {
    display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 16px',
    borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)',
    minWidth: 0, overflowX: 'auto', overflowY: 'visible', scrollbarWidth: 'thin',
  },
  backBtn: {
    padding: '6px 12px', borderRadius: '4px', border: 'none',
    background: 'var(--color-bg-hover)', color: 'var(--color-accent)',
    cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', gap: 4,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  workflowNameInput: {
    flex: 1, background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
    fontSize: '16px', fontWeight: 600, outline: 'none', minWidth: 140,
  },
  editorActions: {
    display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
  },
  runEditorBtn: {
    padding: '6px 14px', borderRadius: '6px', border: 'none',
    background: 'var(--color-accent)', color: 'var(--color-text-inverse)',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  saveBtn: {
    padding: '6px 14px', borderRadius: '6px', border: 'none',
    background: 'var(--color-success, #30d158)', color: 'var(--color-text-inverse)',
    fontSize: '13px', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  templatesPanel: {
    position: 'absolute' as const, top: 52, right: 16, zIndex: 'var(--z-modal)',
    background: 'var(--color-bg-elevated)',
    border: '1px solid var(--color-border)', borderRadius: 10,
    padding: 16, width: 'min(280px, calc(100% - 32px))', maxHeight: 'min(420px, calc(100% - 68px))',
    overflow: 'auto', boxShadow: 'var(--pg-shadow-panel)', boxSizing: 'border-box' as const,
  },
  templateCard: {
    display: 'block', width: '100%', textAlign: 'left' as const, padding: '10px 12px',
    borderRadius: 6, border: 'none', background: 'var(--color-border-subtle)',
    cursor: 'pointer', marginBottom: 6,
  },
  editorContent: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' as const },
  canvasContainer: {
    flex: 1, minWidth: 240, position: 'relative' as const, overflow: 'auto',
    background: 'var(--color-bg-base)',
  },
  emptyEditor: {
    position: 'absolute' as const, inset: 0,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    color: 'var(--color-text-secondary)', textAlign: 'center',
  },

  // Right panel
  rightPanel: {
    width: 'clamp(240px, 28%, 320px)', borderLeft: '1px solid var(--color-border)',
    display: 'flex', flexDirection: 'column', background: 'var(--color-bg-secondary)',
    minWidth: 220, maxWidth: '42%', flexShrink: 0,
  },
  configPanel: { padding: 16, overflowY: 'auto' as const, flex: 1 },
  configInput: {
    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)', color: 'var(--color-text-primary)', fontSize: 12, outline: 'none',
    boxSizing: 'border-box' as const,
  },
  configSelect: {
    width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--color-border)',
    background: 'var(--color-border-subtle)', color: 'var(--color-text-primary)', fontSize: 12, cursor: 'pointer',
    boxSizing: 'border-box' as const,
  },
  actionLibrary: { display: 'flex', flexDirection: 'column', flex: 1 },
  libraryHeader: { padding: '14px 16px', borderBottom: '1px solid var(--color-border)' },
  libraryTitle: { fontSize: '14px', fontWeight: 600 },
  actionSearchBox: {
    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px',
    borderRadius: 6, background: 'var(--color-border-subtle)',
    border: '1px solid var(--color-border-subtle)', color: 'var(--color-text-muted)',
  },
  actionSearchInput: {
    flex: 1, background: 'transparent', border: 'none', color: 'var(--color-text-primary)',
    fontSize: 12, outline: 'none',
  },
  actionList: { flex: 1, overflow: 'auto', padding: '8px' },
  actionItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
    borderRadius: '6px', cursor: 'pointer', marginBottom: '4px',
    background: 'var(--color-bg-elevated)', border: 'none', width: '100%',
    textAlign: 'left' as const, color: 'var(--color-text-primary)', minWidth: 0,
  },
  actionIcon: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)', width: 20 },
  actionInfo: { flex: 1, minWidth: 0 },
  actionName: { display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  actionDesc: { display: 'block', fontSize: '11px', color: 'var(--color-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};

Workflows.displayName = 'Workflows';
export default memo(Workflows);

