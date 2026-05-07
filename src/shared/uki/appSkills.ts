// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Per-app skill bundles for UKI. Each function returns a SkillRegistry
 * pre-loaded with the canonical skills for that app. Pure data — no UI,
 * no I/O — so they are safe to load eagerly.
 *
 * Skill ids are namespaced `<app>.<verb>` so multiple bundles can be
 * merged into one global registry without collision.
 */

// DEX v3.8.9 wave D - per-app skill bundles

import {
  createSkillRegistry, registerSkill, type Skill, type SkillRegistry,
} from './skills';

function bundle(skills: Skill[]): SkillRegistry {
  let r = createSkillRegistry();
  for (const s of skills) r = registerSkill(r, s);
  return r;
}

// ---------------- DexCode ----------------

export const dexCodeSkills = (): SkillRegistry => bundle([
  {
    id: 'dexcode.explain',
    label: 'Explain selection',
    intent: 'explain',
    appIds: ['dexcode'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.explainCode', params: { code: '{{selectionText}}' } }] },
  },
  {
    id: 'dexcode.fixError',
    label: 'Fix this error',
    intent: 'fix error',
    appIds: ['dexcode'],
    requiredContext: ['errorText'],
    plan: { steps: [
      { actionId: 'uki.diagnoseError', params: { error: '{{errorText}}' } },
      { actionId: 'uki.proposePatch', params: {}, dependsOn: [], retries: 1 },
    ] },
  },
  {
    id: 'dexcode.generateTest',
    label: 'Generate test',
    intent: 'generate test',
    appIds: ['dexcode'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.generateTest', params: { code: '{{selectionText}}' } }] },
  },
  {
    id: 'dexcode.docstring',
    label: 'Write docstring',
    intent: 'docstring',
    appIds: ['dexcode'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.writeDocstring', params: { code: '{{selectionText}}' } }] },
  },
  {
    id: 'dexcode.refactor',
    label: 'Refactor selection',
    intent: 'refactor',
    appIds: ['dexcode'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.refactor', params: { code: '{{selectionText}}' } }] },
  },
]);

// ---------------- Terminal ----------------

export const terminalSkills = (): SkillRegistry => bundle([
  {
    id: 'terminal.explain',
    label: 'Explain command',
    intent: 'explain command',
    appIds: ['terminal'],
    requiredContext: ['command'],
    plan: { steps: [{ actionId: 'uki.explainCommand', params: { command: '{{command}}' } }] },
  },
  {
    id: 'terminal.fixStderr',
    label: 'Fix error from stderr',
    intent: 'fix error',
    appIds: ['terminal'],
    requiredContext: ['stderr'],
    plan: { steps: [{ actionId: 'uki.fixCommand', params: { stderr: '{{stderr}}' } }] },
  },
  {
    id: 'terminal.nlToCommand',
    label: 'Natural language to command',
    intent: 'how do i',
    appIds: ['terminal'],
    plan: { steps: [
      { actionId: 'uki.translateToShell', params: { goal: '{{goal}}' } },
      // confirm-before-run is enforced by the destructive-tier ConfirmDialog
      { actionId: 'shell.runConfirmed', params: {}, dependsOn: [] },
    ] },
  },
  {
    id: 'terminal.searchHistory',
    label: 'Search shell history',
    intent: 'search history',
    appIds: ['terminal'],
    plan: { steps: [{ actionId: 'shell.searchHistory', params: { query: '{{goal}}' } }] },
  },
]);

// ---------------- Notes ----------------

export const notesSkills = (): SkillRegistry => bundle([
  {
    id: 'notes.rewriteTone',
    label: 'Rewrite tone',
    intent: 'rewrite',
    appIds: ['notes', 'dexnotes'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.rewriteTone', params: { text: '{{selectionText}}', tone: 'neutral' } }] },
  },
  {
    id: 'notes.summarize',
    label: 'Summarize',
    intent: 'summarize',
    appIds: ['notes', 'dexnotes'],
    requiredContext: ['noteId'],
    plan: { steps: [{ actionId: 'uki.summarize', params: { noteId: '{{noteId}}' } }] },
  },
  {
    id: 'notes.bulletize',
    label: 'Convert to bullet points',
    intent: 'bullet',
    appIds: ['notes', 'dexnotes'],
    requiredContext: ['selectionText'],
    plan: { steps: [{ actionId: 'uki.bulletize', params: { text: '{{selectionText}}' } }] },
  },
  {
    id: 'notes.semanticSearch',
    label: 'Search across all notes',
    intent: 'find notes',
    appIds: ['notes', 'dexnotes'],
    plan: { steps: [{ actionId: 'notes.semanticSearch', params: { query: '{{goal}}' } }] },
  },
]);

// ---------------- Forge ----------------

export const forgeSkills = (): SkillRegistry => bundle([
  {
    id: 'forge.suggestPreset',
    label: 'Suggest encode preset',
    intent: 'preset',
    appIds: ['forge'],
    requiredContext: ['mediaInfo'],
    plan: { steps: [{ actionId: 'forge.suggestPreset', params: { info: '{{mediaInfo}}' } }] },
  },
  {
    id: 'forge.dedupDetect',
    label: 'Detect duplicate sources',
    intent: 'duplicates',
    appIds: ['forge'],
    plan: { steps: [{ actionId: 'forge.detectDuplicates', params: {} }] },
  },
  {
    id: 'forge.watchFolder',
    label: 'Watch folder for new files',
    intent: 'watch folder',
    appIds: ['forge'],
    requiredContext: ['folderPath'],
    plan: { steps: [{ actionId: 'forge.watchFolder', params: { path: '{{folderPath}}' } }] },
  },
  {
    id: 'forge.verifyHash',
    label: 'Verify post-encode hash',
    intent: 'verify',
    appIds: ['forge'],
    requiredContext: ['outputPath'],
    plan: { steps: [{ actionId: 'forge.hashVerify', params: { path: '{{outputPath}}' } }] },
  },
]);

// ---------------- VINX ----------------

export const vinxSkills = (): SkillRegistry => bundle([
  {
    id: 'vinx.highlightReel',
    label: 'Auto-highlight reel',
    intent: 'highlight reel',
    appIds: ['vinx'],
    requiredContext: ['projectId'],
    plan: { steps: [{ actionId: 'vinx.autoHighlight', params: { project: '{{projectId}}' } }] },
  },
  {
    id: 'vinx.captions',
    label: 'Auto-captions',
    intent: 'captions',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.transcribe', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.smartCuts',
    label: 'Smart cuts at silence / scene change',
    intent: 'smart cuts',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.smartCuts', params: { clip: '{{clipId}}' } }] },
  },
]);

// ---------------- Prism ----------------

export const prismSkills = (): SkillRegistry => bundle([
  {
    id: 'prism.subjectSelect',
    label: 'Select subject',
    intent: 'subject',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.subjectSelect', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.removeBackground',
    label: 'Remove background',
    intent: 'background',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.bgRemove', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.colorMatch',
    label: 'Match colors to reference',
    intent: 'color match',
    appIds: ['prism'],
    requiredContext: ['layerId', 'referenceLayerId'],
    plan: { steps: [{ actionId: 'prism.colorMatch', params: { src: '{{layerId}}', ref: '{{referenceLayerId}}' } }] },
  },
  {
    id: 'prism.smartFill',
    label: 'Smart fill selection',
    intent: 'smart fill',
    appIds: ['prism'],
    requiredContext: ['selectionId'],
    plan: { steps: [{ actionId: 'prism.smartFill', params: { sel: '{{selectionId}}' } }] },
  },
]);

// ---------------- Flux ----------------

export const fluxSkills = (): SkillRegistry => bundle([
  {
    id: 'flux.suggestAnimation',
    label: 'Suggest animation',
    intent: 'animate',
    appIds: ['flux'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'flux.suggestAnimation', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'flux.expressionAutocomplete',
    label: 'Expression autocomplete',
    intent: 'expression',
    appIds: ['flux'],
    requiredContext: ['expressionText'],
    plan: { steps: [{ actionId: 'flux.completeExpression', params: { code: '{{expressionText}}' } }] },
  },
  {
    id: 'flux.motionPreset',
    label: 'Apply motion preset',
    intent: 'motion preset',
    appIds: ['flux'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'flux.applyMotionPreset', params: { layer: '{{layerId}}' } }] },
  },
]);

// ---------------- Imosion ----------------

export const imosionSkills = (): SkillRegistry => bundle([
  {
    id: 'imosion.masteringCoach',
    label: 'Mastering coach',
    intent: 'mastering',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.masteringCoach', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.stemSeparate',
    label: 'Stem separation',
    intent: 'stems',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.stemSeparate', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.tempoKey',
    label: 'Detect tempo and key',
    intent: 'tempo',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.tempoKey', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.podcastCleanup',
    label: 'Podcast cleanup',
    intent: 'podcast',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.podcastCleanup', params: { track: '{{trackId}}' } }] },
  },
]);

// ---------------- AXL ----------------

export const axlSkills = (): SkillRegistry => bundle([
  {
    id: 'axl.parametricSuggest',
    label: 'Suggest parametric features',
    intent: 'parametric',
    appIds: ['axl'],
    requiredContext: ['sketchId'],
    plan: { steps: [{ actionId: 'axl.parametricSuggest', params: { sketch: '{{sketchId}}' } }] },
  },
  {
    id: 'axl.gdtSuggest',
    label: 'Suggest GD&T tolerances',
    intent: 'tolerance',
    appIds: ['axl'],
    requiredContext: ['featureId'],
    plan: { steps: [{ actionId: 'axl.gdtSuggest', params: { feature: '{{featureId}}' } }] },
  },
  {
    id: 'axl.standardParts',
    label: 'Standard part lookup',
    intent: 'standard part',
    appIds: ['axl'],
    plan: { steps: [{ actionId: 'axl.lookupStandardPart', params: { query: '{{goal}}' } }] },
  },
]);

// ---------------- Rewind ----------------

export const rewindSkills = (): SkillRegistry => bundle([
  {
    id: 'rewind.semanticSearch',
    label: 'Semantic search across activity',
    intent: 'find activity',
    appIds: ['rewind'],
    plan: { steps: [{ actionId: 'rewind.semanticSearch', params: { query: '{{goal}}' } }] },
  },
  {
    id: 'rewind.dailyReview',
    label: 'Daily review',
    intent: 'daily review',
    appIds: ['rewind'],
    plan: { steps: [{ actionId: 'rewind.dailyReview', params: {} }] },
  },
  {
    id: 'rewind.detectPattern',
    label: 'Detect repeated patterns',
    intent: 'pattern',
    appIds: ['rewind'],
    plan: { steps: [{ actionId: 'rewind.detectPatterns', params: {} }] },
  },
]);

// ---------------- Gallery ----------------

export const gallerySkills = (): SkillRegistry => bundle([
  {
    id: 'gallery.autoAlbum',
    label: 'Auto-album',
    intent: 'album',
    appIds: ['gallery'],
    plan: { steps: [{ actionId: 'gallery.autoAlbum', params: {} }] },
  },
  {
    id: 'gallery.semanticSearch',
    label: 'Search photos by description',
    intent: 'find photos',
    appIds: ['gallery'],
    plan: { steps: [{ actionId: 'gallery.semanticSearch', params: { query: '{{goal}}' } }] },
  },
  {
    id: 'gallery.duplicates',
    label: 'Find duplicate photos',
    intent: 'duplicates',
    appIds: ['gallery'],
    plan: { steps: [{ actionId: 'gallery.findDuplicates', params: {} }] },
  },
  {
    id: 'gallery.story',
    label: 'Generate story from selection',
    intent: 'story',
    appIds: ['gallery'],
    requiredContext: ['selectionIds'],
    plan: { steps: [{ actionId: 'gallery.generateStory', params: { ids: '{{selectionIds}}' } }] },
  },
]);

// ---------------- Aggregator ----------------

const ALL_BUNDLE_FACTORIES = {
  dexcode: dexCodeSkills,
  terminal: terminalSkills,
  notes: notesSkills,
  forge: forgeSkills,
  vinx: vinxSkills,
  prism: prismSkills,
  flux: fluxSkills,
  imosion: imosionSkills,
  axl: axlSkills,
  rewind: rewindSkills,
  gallery: gallerySkills,
} as const;

export type AppBundleId = keyof typeof ALL_BUNDLE_FACTORIES;

/** Merge any subset of app bundles into a single global SkillRegistry. */
export function loadAppSkillRegistry(apps?: readonly AppBundleId[]): SkillRegistry {
  let r = createSkillRegistry();
  const ids = (apps ?? Object.keys(ALL_BUNDLE_FACTORIES) as AppBundleId[]);
  const seen = new Set<string>();
  for (const id of ids) {
    const bundleReg = ALL_BUNDLE_FACTORIES[id]();
    for (const s of bundleReg.skills) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      r = registerSkill(r, s);
    }
  }
  return r;
}

/** Total skill count across all bundles (deduplicated by id). */
export function totalSkillCount(): number {
  return loadAppSkillRegistry().skills.length;
}
