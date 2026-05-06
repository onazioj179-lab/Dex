// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi.treasure@outlook.com>
// Licensed under the MIT License. See LICENSE in the project root.
// =============================================================================
/**
 * VINX -- Command System
 * Every edit operation is a reversible command for undo/redo.
 */

import type { Clip, ClipEffect, Keyframe, TransitionInstance, CommandType } from './VinxTypes';
import { generateId } from './VinxTypes';
import type { useVinxStore } from './VinxStore';

type StoreApi = ReturnType<typeof useVinxStore.getState>;
type GetState = () => StoreApi;

// ---------------------------------------------------------------------------
// BASE COMMAND
// ---------------------------------------------------------------------------

export interface VinxCommand {
  id: string;
  type: CommandType;
  description: string;
  timestamp: number;
  execute: () => void;
  undo: () => void;
}

function cmd(type: CommandType, description: string, execute: () => void, undo: () => void): VinxCommand {
  return { id: generateId('cmd'), type, description, timestamp: Date.now(), execute, undo };
}

// ---------------------------------------------------------------------------
// COMMAND FACTORY
// ---------------------------------------------------------------------------

export function createAddClipCommand(getState: GetState, clip: Clip): VinxCommand {
  return cmd('add-clip', `Add ${clip.name}`,
    () => getState()._addClip(clip),
    () => getState()._removeClip(clip.id),
  );
}

export function createRemoveClipCommand(getState: GetState, clip: Clip): VinxCommand {
  return cmd('remove-clip', `Remove ${clip.name}`,
    () => getState()._removeClip(clip.id),
    () => getState()._addClip(clip),
  );
}

export function createMoveClipCommand(
  getState: GetState,
  clipId: string,
  fromTrackId: string,
  fromStartFrame: number,
  toTrackId: string,
  toStartFrame: number,
): VinxCommand {
  return cmd('move-clip', 'Move clip',
    () => getState()._moveClip(clipId, toTrackId, toStartFrame),
    () => getState()._moveClip(clipId, fromTrackId, fromStartFrame),
  );
}

export function createTrimClipCommand(
  getState: GetState,
  clipId: string,
  oldStart: number, oldEnd: number, oldMediaIn: number, oldMediaOut: number,
  newStart: number, newEnd: number, newMediaIn: number, newMediaOut: number,
): VinxCommand {
  return cmd('trim-clip', 'Trim clip',
    () => getState()._trimClip(clipId, newStart, newEnd, newMediaIn, newMediaOut),
    () => getState()._trimClip(clipId, oldStart, oldEnd, oldMediaIn, oldMediaOut),
  );
}

export function createSplitClipCommand(
  getState: GetState,
  originalClip: Clip,
  leftClip: Clip,
  rightClip: Clip,
): VinxCommand {
  return cmd('split-clip', 'Split clip',
    () => {
      const s = getState();
      s._removeClip(originalClip.id);
      s._addClip(leftClip);
      s._addClip(rightClip);
    },
    () => {
      const s = getState();
      s._removeClip(leftClip.id);
      s._removeClip(rightClip.id);
      s._addClip(originalClip);
    },
  );
}

export function createUpdateClipCommand(
  getState: GetState,
  clipId: string,
  oldValues: Partial<Clip>,
  newValues: Partial<Clip>,
  description: string,
): VinxCommand {
  return cmd('update-clip', description,
    () => getState()._updateClip(clipId, newValues),
    () => getState()._updateClip(clipId, oldValues),
  );
}

export function createAddEffectCommand(
  getState: GetState,
  clipId: string,
  effect: ClipEffect,
): VinxCommand {
  return cmd('add-effect', `Add ${effect.name}`,
    () => getState()._addEffect(clipId, effect),
    () => getState()._removeEffect(clipId, effect.id),
  );
}

export function createRemoveEffectCommand(
  getState: GetState,
  clipId: string,
  effect: ClipEffect,
): VinxCommand {
  return cmd('remove-effect', `Remove ${effect.name}`,
    () => getState()._removeEffect(clipId, effect.id),
    () => getState()._addEffect(clipId, effect),
  );
}

export function createUpdateEffectParamCommand(
  getState: GetState,
  clipId: string,
  effectId: string,
  paramId: string,
  oldValue: number | string | boolean,
  newValue: number | string | boolean,
): VinxCommand {
  return cmd('update-effect-param', 'Update effect parameter',
    () => getState()._updateEffectParam(clipId, effectId, paramId, newValue),
    () => getState()._updateEffectParam(clipId, effectId, paramId, oldValue),
  );
}

export function createAddKeyframeCommand(
  getState: GetState,
  clipId: string,
  property: string,
  keyframe: Keyframe,
): VinxCommand {
  return cmd('add-keyframe', 'Add keyframe',
    () => getState()._addKeyframe(clipId, property, keyframe),
    () => getState()._removeKeyframe(clipId, property, keyframe.frame),
  );
}

export function createRemoveKeyframeCommand(
  getState: GetState,
  clipId: string,
  property: string,
  keyframe: Keyframe,
): VinxCommand {
  return cmd('remove-keyframe', 'Remove keyframe',
    () => getState()._removeKeyframe(clipId, property, keyframe.frame),
    () => getState()._addKeyframe(clipId, property, keyframe),
  );
}

export function createMoveKeyframeCommand(
  getState: GetState,
  clipId: string,
  property: string,
  oldFrame: number,
  oldValue: number,
  newFrame: number,
  newValue: number,
): VinxCommand {
  return cmd('move-keyframe', 'Move keyframe',
    () => getState()._moveKeyframe(clipId, property, oldFrame, newFrame, newValue),
    () => getState()._moveKeyframe(clipId, property, newFrame, oldFrame, oldValue),
  );
}

export function createSetTransitionCommand(
  getState: GetState,
  clipId: string,
  side: 'in' | 'out',
  oldTransition: TransitionInstance | null,
  newTransition: TransitionInstance | null,
): VinxCommand {
  return cmd('set-transition', newTransition ? `Set ${side} transition` : `Remove ${side} transition`,
    () => getState()._setTransition(clipId, side, newTransition),
    () => getState()._setTransition(clipId, side, oldTransition),
  );
}

export function createRippleDeleteCommand(
  getState: GetState,
  deletedClip: Clip,
  affectedClips: Array<{ id: string; oldStart: number; oldEnd: number; newStart: number; newEnd: number }>,
): VinxCommand {
  return cmd('ripple-delete', `Ripple delete ${deletedClip.name}`,
    () => {
      const s = getState();
      s._removeClip(deletedClip.id);
      for (const ac of affectedClips) {
        s._trimClip(ac.id, ac.newStart, ac.newEnd, 0, 0);
      }
    },
    () => {
      const s = getState();
      for (const ac of affectedClips.reverse()) {
        s._trimClip(ac.id, ac.oldStart, ac.oldEnd, 0, 0);
      }
      s._addClip(deletedClip);
    },
  );
}

export function createBatchCommand(
  commands: VinxCommand[],
  description: string,
): VinxCommand {
  return cmd('batch', description,
    () => { for (const c of commands) c.execute(); },
    () => { for (let i = commands.length - 1; i >= 0; i--) commands[i].undo(); },
  );
}
