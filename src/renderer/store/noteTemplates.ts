// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// ==========================================================================
// DEX Notes -- Built-in starter templates
// ==========================================================================
// Reduce startup friction (DEX 5.5 Workspace Flow initiative): a real catalog
// of ready-to-use note structures, built from the shared document model so the
// content is valid wherever a note is rendered/edited. The store merges these
// with any backend-provided templates and creates a note from the chosen one.
// ==========================================================================

import {
  type DocRoot,
  type DocNode,
  createHeading,
  createBulletList,
  createChecklist,
  serializeDoc,
  docToPlainText,
} from '../DEXAPPLICATIONS/notes/NotesDocumentModel';
import type { NoteTemplate } from './notesStore';

/** Paragraph node, optionally seeded with prompt text. */
const para = (text?: string): DocNode =>
  text ? { type: 'paragraph', text } : { type: 'paragraph', content: [] };

/** Build a NoteTemplate from a list of document nodes. */
function build(id: string, title: string, nodes: DocNode[]): NoteTemplate {
  const doc: DocRoot = { type: 'doc', content: nodes };
  return { id, title, content: serializeDoc(doc), plain_text: docToPlainText(doc) };
}

const emptyChecks = (n: number) =>
  Array.from({ length: n }, () => ({ text: '', checked: false }));

export const DEFAULT_NOTE_TEMPLATES: NoteTemplate[] = [
  build('tmpl-daily', 'Daily Plan', [
    createHeading(1, 'Daily Plan'),
    para('Date: '),
    createHeading(2, 'Top Priorities'),
    createChecklist(emptyChecks(3)),
    createHeading(2, 'Schedule'),
    createBulletList(['Morning', 'Afternoon', 'Evening']),
    createHeading(2, 'Notes'),
    para(),
  ]),
  build('tmpl-weekly', 'Weekly Plan', [
    createHeading(1, 'Weekly Plan'),
    para('Week of: '),
    createHeading(2, 'Goals for the Week'),
    createChecklist(emptyChecks(3)),
    createHeading(2, 'Focus Areas'),
    createBulletList(['', '', '']),
    createHeading(2, 'Review'),
    para('Wins:'),
    para('Lessons:'),
  ]),
  build('tmpl-meeting', 'Meeting Notes', [
    createHeading(1, 'Meeting Notes'),
    para('Date: '),
    para('Attendees: '),
    createHeading(2, 'Agenda'),
    createBulletList(['', '', '']),
    createHeading(2, 'Discussion'),
    para(),
    createHeading(2, 'Action Items'),
    createChecklist(emptyChecks(3)),
    createHeading(2, 'Decisions'),
    createBulletList(['']),
  ]),
  build('tmpl-research', 'Research Notes', [
    createHeading(1, 'Research'),
    createHeading(2, 'Question'),
    para(),
    createHeading(2, 'Sources'),
    createBulletList(['', '']),
    createHeading(2, 'Findings'),
    para(),
    createHeading(2, 'Summary'),
    para(),
  ]),
  build('tmpl-journal', 'Journal', [
    createHeading(1, 'Journal'),
    para('Date: '),
    createHeading(2, "How I'm feeling"),
    para(),
    createHeading(2, 'What happened today'),
    para(),
    createHeading(2, 'Grateful for'),
    createBulletList(['', '', '']),
  ]),

  // --- Development -----------------------------------------------------------
  build('tmpl-sprint', 'Sprint Planning', [
    createHeading(1, 'Sprint Planning'),
    para('Sprint: '),
    para('Dates: '),
    createHeading(2, 'Sprint Goal'),
    para(),
    createHeading(2, 'Committed'),
    createChecklist(emptyChecks(4)),
    createHeading(2, 'Stretch Goals'),
    createBulletList(['', '']),
    createHeading(2, 'Risks & Blockers'),
    createBulletList(['']),
  ]),
  build('tmpl-architecture', 'Architecture Review', [
    createHeading(1, 'Architecture Review'),
    createHeading(2, 'Context'),
    para(),
    createHeading(2, 'Proposed Design'),
    para(),
    createHeading(2, 'Alternatives Considered'),
    createBulletList(['', '']),
    createHeading(2, 'Trade-offs'),
    createBulletList(['']),
    createHeading(2, 'Decision'),
    para(),
    createHeading(2, 'Action Items'),
    createChecklist(emptyChecks(3)),
  ]),
  build('tmpl-project', 'Project Tracker', [
    createHeading(1, 'Project Tracker'),
    para('Status: '),
    createHeading(2, 'Milestones'),
    createChecklist(emptyChecks(4)),
    createHeading(2, 'Blockers'),
    createBulletList(['']),
    createHeading(2, 'Next Steps'),
    createChecklist(emptyChecks(3)),
  ]),

  // --- Creative boards -------------------------------------------------------
  build('tmpl-brainstorm', 'Brainstorm', [
    createHeading(1, 'Brainstorm'),
    para('Topic: '),
    createHeading(2, 'Ideas'),
    createBulletList(['', '', '', '']),
    createHeading(2, 'Themes'),
    createBulletList(['']),
    createHeading(2, 'Top Picks'),
    createChecklist(emptyChecks(3)),
  ]),
  build('tmpl-storyboard', 'Storyboard', [
    createHeading(1, 'Storyboard'),
    createHeading(2, 'Concept'),
    para(),
    createHeading(2, 'Scenes'),
    createBulletList(['Scene 1 — ', 'Scene 2 — ', 'Scene 3 — ']),
    createHeading(2, 'Notes'),
    para(),
  ]),
  build('tmpl-product', 'Product Plan', [
    createHeading(1, 'Product Plan'),
    createHeading(2, 'Problem'),
    para(),
    createHeading(2, 'Target Users'),
    createBulletList(['']),
    createHeading(2, 'Features'),
    createChecklist(emptyChecks(4)),
    createHeading(2, 'Success Metrics'),
    createBulletList(['']),
  ]),

  // --- Media -----------------------------------------------------------------
  build('tmpl-content', 'Content Plan', [
    createHeading(1, 'Content Plan'),
    createHeading(2, 'Goal'),
    para(),
    createHeading(2, 'Channels'),
    createBulletList(['']),
    createHeading(2, 'Calendar'),
    createChecklist(emptyChecks(4)),
    createHeading(2, 'Ideas'),
    createBulletList(['', '']),
  ]),
  build('tmpl-production', 'Production Workflow', [
    createHeading(1, 'Production Workflow'),
    para('Project: '),
    createHeading(2, 'Pre-production'),
    createChecklist(emptyChecks(3)),
    createHeading(2, 'Production'),
    createChecklist(emptyChecks(3)),
    createHeading(2, 'Post-production'),
    createChecklist(emptyChecks(3)),
  ]),
];

/** Look up a built-in template by id. */
export function findBuiltinTemplate(id: string): NoteTemplate | undefined {
  return DEFAULT_NOTE_TEMPLATES.find(t => t.id === id);
}
