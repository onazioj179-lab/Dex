// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Creative action handlers for the UKI action executor. Each creative skill in
 * appSkills.ts references an `actionId` (e.g. `prism.subjectSelect`); this file
 * binds those ids to pure handlers that emit a canonical `CreativeOp`
 * descriptor. The renderer/main bridge (UkiCreativeOperator / ActionEngine)
 * applies the descriptor to the live app — but the descriptor itself is pure
 * data, so the whole NL -> op path is unit-testable headlessly.
 *
 * `mutates` distinguishes document-changing ops (drive undo + confirm dialogs)
 * from read-only suggestions.
 */

// DEX v6.0 — UKI brain: creative control handlers (ROADMAP-600 wiring)

import {
  createActionRegistry, registerActions,
  type ActionHandler, type ActionRegistry,
} from './actionExecutor';

export type CreativeApp = 'prism' | 'vinx' | 'imosion' | 'flux' | 'axl';

export interface CreativeOp {
  /** Target creative app. */
  app: CreativeApp;
  /** Canonical operation name the app understands. */
  op: string;
  /** Resolved parameters (already `{{var}}`-interpolated by the executor). */
  params: Record<string, unknown>;
  /** True when the op changes the document (undoable / may need confirm). */
  mutates: boolean;
}

interface OpSpec {
  app: CreativeApp;
  op: string;
  mutates: boolean;
}

/**
 * actionId -> operation spec. Covers every creative `actionId` referenced by
 * appSkills.ts (existing + the expanded control set). Keep ids in sync with
 * appSkills so `matchSkills -> decompose -> executePlan` never hits a missing
 * handler.
 */
export const CREATIVE_ACTION_SPECS: Record<string, OpSpec> = {
  // -------- Prism (image) --------
  'prism.subjectSelect': { app: 'prism', op: 'selectSubject', mutates: false },
  'prism.bgRemove': { app: 'prism', op: 'removeBackground', mutates: true },
  'prism.colorMatch': { app: 'prism', op: 'colorMatch', mutates: true },
  'prism.smartFill': { app: 'prism', op: 'smartFill', mutates: true },
  'prism.generativeFill': { app: 'prism', op: 'generativeFill', mutates: true },
  'prism.expandCanvas': { app: 'prism', op: 'generativeExpand', mutates: true },
  'prism.upscale': { app: 'prism', op: 'upscale', mutates: true },
  'prism.relight': { app: 'prism', op: 'relight', mutates: true },
  'prism.styleTransfer': { app: 'prism', op: 'styleTransfer', mutates: true },
  'prism.denoise': { app: 'prism', op: 'denoise', mutates: true },
  'prism.perspectiveFix': { app: 'prism', op: 'perspectiveFix', mutates: true },
  'prism.objectRemove': { app: 'prism', op: 'removeObject', mutates: true },
  'prism.skyReplace': { app: 'prism', op: 'replaceSky', mutates: true },
  'prism.autoEnhance': { app: 'prism', op: 'autoEnhance', mutates: true },
  'prism.colorGrade': { app: 'prism', op: 'colorGrade', mutates: true },

  // -------- Vinx (video) --------
  'vinx.autoHighlight': { app: 'vinx', op: 'autoHighlight', mutates: true },
  'vinx.transcribe': { app: 'vinx', op: 'transcribe', mutates: false },
  'vinx.smartCuts': { app: 'vinx', op: 'smartCuts', mutates: true },
  'vinx.silenceRemoval': { app: 'vinx', op: 'removeSilence', mutates: true },
  'vinx.autoReframe': { app: 'vinx', op: 'autoReframe', mutates: true },
  'vinx.bRollSuggest': { app: 'vinx', op: 'suggestBRoll', mutates: false },
  'vinx.autoColorMatch': { app: 'vinx', op: 'autoColorMatch', mutates: true },
  'vinx.stabilize': { app: 'vinx', op: 'stabilize', mutates: true },
  'vinx.speedRamp': { app: 'vinx', op: 'speedRamp', mutates: true },
  'vinx.removeFiller': { app: 'vinx', op: 'removeFillerWords', mutates: true },
  'vinx.sceneDetect': { app: 'vinx', op: 'detectScenes', mutates: false },
  'vinx.autoDuck': { app: 'vinx', op: 'autoDuckMusic', mutates: true },

  // -------- Imosion (audio / DAW) --------
  'imosion.masteringCoach': { app: 'imosion', op: 'masteringCoach', mutates: false },
  'imosion.stemSeparate': { app: 'imosion', op: 'separateStems', mutates: true },
  'imosion.tempoKey': { app: 'imosion', op: 'detectTempoKey', mutates: false },
  'imosion.podcastCleanup': { app: 'imosion', op: 'podcastCleanup', mutates: true },
  'imosion.autoMix': { app: 'imosion', op: 'autoMix', mutates: true },
  'imosion.melodyToChords': { app: 'imosion', op: 'melodyToChords', mutates: true },
  'imosion.deNoise': { app: 'imosion', op: 'denoise', mutates: true },
  'imosion.vocalAlign': { app: 'imosion', op: 'vocalAlign', mutates: true },
  'imosion.autoTune': { app: 'imosion', op: 'pitchCorrect', mutates: true },
  'imosion.loudnessMatch': { app: 'imosion', op: 'loudnessMatch', mutates: true },
  'imosion.beatDetect': { app: 'imosion', op: 'detectBeats', mutates: false },
  'imosion.deEss': { app: 'imosion', op: 'deEss', mutates: true },

  // -------- Flux (motion) --------
  'flux.suggestAnimation': { app: 'flux', op: 'suggestAnimation', mutates: false },
  'flux.completeExpression': { app: 'flux', op: 'completeExpression', mutates: false },
  'flux.applyMotionPreset': { app: 'flux', op: 'applyMotionPreset', mutates: true },
  'flux.textToMotion': { app: 'flux', op: 'textToMotion', mutates: true },
  'flux.autoRig': { app: 'flux', op: 'autoRig', mutates: true },
  'flux.physics': { app: 'flux', op: 'applyPhysics', mutates: true },
  'flux.cameraPath': { app: 'flux', op: 'generateCameraPath', mutates: true },
  'flux.lipSync': { app: 'flux', op: 'lipSync', mutates: true },

  // -------- Axl (CAD / 3D) --------
  'axl.parametricSuggest': { app: 'axl', op: 'parametricSuggest', mutates: false },
  'axl.gdtSuggest': { app: 'axl', op: 'gdtSuggest', mutates: false },
  'axl.lookupStandardPart': { app: 'axl', op: 'lookupStandardPart', mutates: false },
  'axl.designForManufacture': { app: 'axl', op: 'dfmCheck', mutates: false },
  'axl.topologyOptimize': { app: 'axl', op: 'topologyOptimize', mutates: true },
  'axl.massProperties': { app: 'axl', op: 'massProperties', mutates: false },
  // Mutating CAD actions driven by the command bar (real store ops).
  'axl.addPrimitive': { app: 'axl', op: 'addPrimitive', mutates: true },
  'axl.shellPart': { app: 'axl', op: 'shellPart', mutates: true },
  'axl.draftPart': { app: 'axl', op: 'draftPart', mutates: true },
  'axl.ribPart': { app: 'axl', op: 'ribPart', mutates: true },
  'axl.runSimulation': { app: 'axl', op: 'runSimulation', mutates: false },
  'axl.explode': { app: 'axl', op: 'explode', mutates: true },
  'axl.section': { app: 'axl', op: 'section', mutates: false },
  'axl.interference': { app: 'axl', op: 'interference', mutates: false },
  'axl.generateBOM': { app: 'axl', op: 'generateBOM', mutates: false },
  'axl.exportModel': { app: 'axl', op: 'exportModel', mutates: false },
  'axl.newSketch': { app: 'axl', op: 'newSketch', mutates: false },
};

function makeHandler(spec: OpSpec): ActionHandler {
  return (params): CreativeOp => ({
    app: spec.app, op: spec.op, params, mutates: spec.mutates,
  });
}

/**
 * Build (or extend) an ActionRegistry pre-loaded with every creative handler.
 * Pass the global registry to merge creative handlers alongside others.
 */
export function creativeActionRegistry(base: ActionRegistry = createActionRegistry()): ActionRegistry {
  const entries: Record<string, ActionHandler> = {};
  for (const [actionId, spec] of Object.entries(CREATIVE_ACTION_SPECS)) {
    entries[actionId] = makeHandler(spec);
  }
  return registerActions(base, entries);
}

/** All creative action ids (for coverage checks against appSkills). */
export function creativeActionIds(): string[] {
  return Object.keys(CREATIVE_ACTION_SPECS);
}

/** Look up the operation spec for an actionId (undefined if not creative). */
export function creativeOpSpec(actionId: string): Readonly<OpSpec> | undefined {
  return CREATIVE_ACTION_SPECS[actionId];
}
