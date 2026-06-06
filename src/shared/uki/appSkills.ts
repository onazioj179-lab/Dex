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
  {
    id: 'vinx.silenceRemoval',
    label: 'Remove silences',
    intent: 'remove silence',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.silenceRemoval', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.autoReframe',
    label: 'Auto-reframe to aspect ratio',
    intent: 'reframe',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.autoReframe', params: { clip: '{{clipId}}', aspect: '9:16' } }] },
  },
  {
    id: 'vinx.bRollSuggest',
    label: 'Suggest B-roll',
    intent: 'b-roll',
    appIds: ['vinx'],
    requiredContext: ['projectId'],
    plan: { steps: [{ actionId: 'vinx.bRollSuggest', params: { project: '{{projectId}}' } }] },
  },
  {
    id: 'vinx.autoColorMatch',
    label: 'Auto color match to reference',
    intent: 'color match',
    appIds: ['vinx'],
    requiredContext: ['clipId', 'referenceClipId'],
    plan: { steps: [{ actionId: 'vinx.autoColorMatch', params: { clip: '{{clipId}}', ref: '{{referenceClipId}}' } }] },
  },
  {
    id: 'vinx.stabilize',
    label: 'Stabilize shaky footage',
    intent: 'stabilize',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.stabilize', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.speedRamp',
    label: 'Add speed ramp',
    intent: 'speed ramp',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.speedRamp', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.removeFiller',
    label: 'Remove filler words',
    intent: 'remove filler',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.removeFiller', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.sceneDetect',
    label: 'Detect scene changes',
    intent: 'detect scenes',
    appIds: ['vinx'],
    requiredContext: ['clipId'],
    plan: { steps: [{ actionId: 'vinx.sceneDetect', params: { clip: '{{clipId}}' } }] },
  },
  {
    id: 'vinx.autoDuck',
    label: 'Auto-duck music under dialogue',
    intent: 'duck music',
    appIds: ['vinx'],
    requiredContext: ['projectId'],
    plan: { steps: [{ actionId: 'vinx.autoDuck', params: { project: '{{projectId}}' } }] },
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
  {
    id: 'prism.generativeFill',
    label: 'Generative fill',
    intent: 'generative fill',
    appIds: ['prism'],
    requiredContext: ['selectionId'],
    plan: { steps: [{ actionId: 'prism.generativeFill', params: { sel: '{{selectionId}}', prompt: '{{goal}}' } }] },
  },
  {
    id: 'prism.expandCanvas',
    label: 'Generative expand canvas',
    intent: 'expand',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.expandCanvas', params: { layer: '{{layerId}}', prompt: '{{goal}}' } }] },
  },
  {
    id: 'prism.upscale',
    label: 'AI upscale',
    intent: 'upscale',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.upscale', params: { layer: '{{layerId}}', factor: 2 } }] },
  },
  {
    id: 'prism.relight',
    label: 'Relight subject',
    intent: 'relight',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.relight', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.styleTransfer',
    label: 'Style transfer from reference',
    intent: 'style',
    appIds: ['prism'],
    requiredContext: ['layerId', 'referenceLayerId'],
    plan: { steps: [{ actionId: 'prism.styleTransfer', params: { layer: '{{layerId}}', ref: '{{referenceLayerId}}' } }] },
  },
  {
    id: 'prism.denoise',
    label: 'Denoise image',
    intent: 'denoise',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.denoise', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.perspectiveFix',
    label: 'Fix perspective',
    intent: 'perspective',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.perspectiveFix', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.objectRemove',
    label: 'Remove object',
    intent: 'remove object',
    appIds: ['prism'],
    requiredContext: ['selectionId'],
    plan: { steps: [{ actionId: 'prism.objectRemove', params: { sel: '{{selectionId}}' } }] },
  },
  {
    id: 'prism.skyReplace',
    label: 'Replace sky',
    intent: 'replace sky',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.skyReplace', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.autoEnhance',
    label: 'Auto-enhance',
    intent: 'enhance',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.autoEnhance', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'prism.colorGrade',
    label: 'Color grade to look',
    intent: 'color grade',
    appIds: ['prism'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'prism.colorGrade', params: { layer: '{{layerId}}', look: '{{goal}}' } }] },
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
  {
    id: 'flux.textToMotion',
    label: 'Text to motion',
    intent: 'text to motion',
    appIds: ['flux'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'flux.textToMotion', params: { layer: '{{layerId}}', prompt: '{{goal}}' } }] },
  },
  {
    id: 'flux.autoRig',
    label: 'Auto-rig character',
    intent: 'rig',
    appIds: ['flux'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'flux.autoRig', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'flux.physics',
    label: 'Apply physics simulation',
    intent: 'physics',
    appIds: ['flux'],
    requiredContext: ['layerId'],
    plan: { steps: [{ actionId: 'flux.physics', params: { layer: '{{layerId}}' } }] },
  },
  {
    id: 'flux.cameraPath',
    label: 'Generate camera path',
    intent: 'camera path',
    appIds: ['flux'],
    requiredContext: ['sceneId'],
    plan: { steps: [{ actionId: 'flux.cameraPath', params: { scene: '{{sceneId}}' } }] },
  },
  {
    id: 'flux.lipSync',
    label: 'Lip sync to audio',
    intent: 'lip sync',
    appIds: ['flux'],
    requiredContext: ['layerId', 'audioId'],
    plan: { steps: [{ actionId: 'flux.lipSync', params: { layer: '{{layerId}}', audio: '{{audioId}}' } }] },
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
  {
    id: 'imosion.autoMix',
    label: 'Auto-mix session',
    intent: 'auto mix',
    appIds: ['imosion'],
    requiredContext: ['projectId'],
    plan: { steps: [{ actionId: 'imosion.autoMix', params: { project: '{{projectId}}' } }] },
  },
  {
    id: 'imosion.melodyToChords',
    label: 'Melody to chords',
    intent: 'chords',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.melodyToChords', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.deNoise',
    label: 'Denoise track',
    intent: 'denoise',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.deNoise', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.vocalAlign',
    label: 'Align double-tracked vocals',
    intent: 'align vocals',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.vocalAlign', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.autoTune',
    label: 'Pitch correct to key',
    intent: 'tune',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.autoTune', params: { track: '{{trackId}}', key: '{{goal}}' } }] },
  },
  {
    id: 'imosion.loudnessMatch',
    label: 'Match loudness target',
    intent: 'loudness',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.loudnessMatch', params: { track: '{{trackId}}', target: -14 } }] },
  },
  {
    id: 'imosion.beatDetect',
    label: 'Detect beats',
    intent: 'detect beats',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.beatDetect', params: { track: '{{trackId}}' } }] },
  },
  {
    id: 'imosion.deEss',
    label: 'De-ess vocals',
    intent: 'de-ess',
    appIds: ['imosion'],
    requiredContext: ['trackId'],
    plan: { steps: [{ actionId: 'imosion.deEss', params: { track: '{{trackId}}' } }] },
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
  {
    id: 'axl.designForManufacture',
    label: 'Design-for-manufacture check',
    intent: 'manufactur',
    appIds: ['axl'],
    requiredContext: ['partId'],
    plan: { steps: [{ actionId: 'axl.designForManufacture', params: { part: '{{partId}}' } }] },
  },
  {
    id: 'axl.topologyOptimize',
    label: 'Topology optimize',
    intent: 'topology',
    appIds: ['axl'],
    requiredContext: ['partId'],
    plan: { steps: [{ actionId: 'axl.topologyOptimize', params: { part: '{{partId}}' } }] },
  },
  {
    id: 'axl.massProperties',
    label: 'Mass properties',
    intent: 'mass',
    appIds: ['axl'],
    requiredContext: ['partId'],
    plan: { steps: [{ actionId: 'axl.massProperties', params: { part: '{{partId}}' } }] },
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
