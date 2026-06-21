// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * DEX Learn -- per-app self-teaching registry
 * -----------------------------------------------------------------------------
 * The brief's Education layer: "every app can teach itself." Each app can
 * register a short, structured guide (overview + sections of bullet tips). The
 * Learn overlay reads it for the current app; apps without a custom guide fall
 * back to a generic one built from APP_DEFINITIONS + the DEX-wide shortcuts, so
 * EVERY app is teachable with zero per-app work.
 *
 * Pure data + DOM-free; the overlay is the consumer.
 */

export interface LearnSection {
  heading: string;
  items: string[];
}

export interface LearnContent {
  overview?: string;
  sections?: LearnSection[];
}

const registry = new Map<string, LearnContent>();

export function registerLearnContent(appId: string, content: LearnContent): void {
  registry.set(appId, content);
}

export function getLearnContent(appId: string): LearnContent | undefined {
  return registry.get(appId);
}

export function hasLearnContent(appId: string): boolean {
  return registry.has(appId);
}

/** Tips that apply across the whole OS -- shown in every app's generic guide and
 *  appended to custom guides so the DEX-wide superpowers are always discoverable. */
export const GLOBAL_LEARN_TIPS: string[] = [
  'Search anything with Spotlight (Ctrl/Cmd+K)',
  'Run any command from the Command Palette (Ctrl/Cmd+Shift+P)',
  'Reuse anything you copied from the Omni Clipboard (Ctrl/Cmd+Shift+V)',
  'Send content to another app with DEX Flow (Ctrl/Cmd+Shift+O)',
  'See what you are working on with the "Now" command',
];

let registered = false;

/** Register the built-in guides for DEX's flagship apps. Idempotent. */
export function registerBuiltinLearn(): void {
  if (registered) return;
  registered = true;

  registerLearnContent('notes', {
    overview: "Notes is DEX's writing space — rich text, folders, links between notes, and instant search.",
    sections: [
      { heading: 'Write', items: [
        'Format with the toolbar or markdown shortcuts',
        'Link notes with [[note name]] to build a web of ideas',
        'Jump between headings with the document outline',
      ] },
      { heading: 'Organize', items: [
        'Group notes into folders',
        'Search across every note instantly',
        'Pin the notes you return to most',
      ] },
      { heading: 'Flow', items: [
        'Send any text to a new note from another app with DEX Flow (Ctrl/Cmd+Shift+O → Notes)',
      ] },
    ],
  });

  registerLearnContent('dexcode', {
    overview: "DexCode is DEX's code editor — fast, syntax-aware editing with developer ergonomics.",
    sections: [
      { heading: 'Edit', items: [
        'Jump to the matching bracket with Ctrl/Cmd+M',
        'Live selection stats (chars / lines) show in the status bar',
        'Syntax-aware editing for common languages',
      ] },
      { heading: 'Flow', items: [
        'Copied code is language-detected and searchable in the Omni Clipboard',
        'Send a snippet to Notes or search it in the Browser with DEX Flow',
      ] },
    ],
  });

  registerLearnContent('prism', {
    overview: 'PRISM is DEX’s image editor — layers, selections, filters, and non-destructive adjustments.',
    sections: [
      { heading: 'Edit', items: [
        'Work in layers; adjustments stay non-destructive',
        'Use selections to target edits precisely',
        'Apply filters and color adjustments',
      ] },
      { heading: 'Flow', items: [
        'Send an image straight into PRISM from anywhere with DEX Flow (Ctrl/Cmd+Shift+O → PRISM)',
        'Copied images land in the Omni Clipboard, ready to reuse',
      ] },
    ],
  });

  registerLearnContent('files', {
    overview: "Files is DEX's file manager — browse, search, and act on your files.",
    sections: [
      { heading: 'Navigate', items: [
        'Files sort by natural order ("file2" before "file10")',
        'Search to filter the current view instantly',
        'Multi-select for bulk actions',
      ] },
    ],
  });
}
