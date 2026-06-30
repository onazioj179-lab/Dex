// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// Dynamic "spinner verbs" for UKI's thinking indicator.
//
// Two ideas, borrowed from two assistants:
//   - Claude rotates a pool of present-participle verbs ("Pondering",
//     "Conjuring") so the wait feels alive rather than frozen on one word.
//   - Siri reflects what it is *actually doing* ("Searching the web…") so the
//     feedback is honest about the current step.
//
// This engine does both: it cycles a curated pool, and it swaps pools to match
// UKI's latest action (the thought-step trace and the agentic tool the loop is
// running). The result is a status line that is both lively and truthful.

/** A named pool of verbs cycled while UKI is in a given context. */
type VerbPool = { id: string; verbs: readonly string[] };

// General-purpose reasoning — used when no specific tool/step context applies.
const GENERAL: VerbPool = {
  id: 'general',
  verbs: [
    'Thinking', 'Pondering', 'Reasoning', 'Considering', 'Mulling it over',
    'Reflecting', 'Connecting the dots', 'Working it out', 'Weighing it up',
    'Turning it over',
  ],
};

// Context pools. Order matters: matchers are tested top-to-bottom and the first
// hit wins, so put the most specific patterns first.
const POOLS: { match: RegExp; pool: VerbPool }[] = [
  {
    match: /web_search|searching the web|look(ing)? it up|search/i,
    pool: { id: 'web', verbs: [
      'Searching the web', 'Looking it up', 'Scanning sources',
      'Chasing down the facts', 'Gathering results', 'Combing the web',
    ] },
  },
  {
    match: /open_app|launch|opening/i,
    pool: { id: 'open', verbs: [
      'Opening that up', 'Launching it', 'Getting it ready', 'Bringing it up',
    ] },
  },
  {
    match: /close_app|closing|tidy/i,
    pool: { id: 'close', verbs: ['Closing that', 'Tidying up', 'Wrapping that up'] },
  },
  {
    match: /get_context|list_apps|context:|probing|reading the screen|screen-read/i,
    pool: { id: 'context', verbs: [
      'Reading the room', 'Checking your context', 'Looking around',
      'Getting my bearings', 'Taking it in',
    ] },
  },
  {
    match: /notify/i,
    pool: { id: 'notify', verbs: ['Sending that along', 'Notifying you', 'Pinging you'] },
  },
  {
    match: /tone|sentiment|between the lines/i,
    pool: { id: 'tone', verbs: ['Reading between the lines', 'Picking up on the mood', 'Tuning in'] },
  },
  {
    match: /slash command|autopilot|matched|intent|normaliz/i,
    pool: { id: 'command', verbs: [
      'Lining up the command', 'Matching your intent', 'Mapping it out',
    ] },
  },
  {
    match: /synthesi|final answer|max tool steps|composing|drafting/i,
    pool: { id: 'compose', verbs: [
      'Pulling it together', 'Drafting the answer', 'Composing a reply',
      'Wrapping up', 'Putting it into words',
    ] },
  },
];

/**
 * Choose the verb pool that best matches UKI's latest thought step. Falls back
 * to the general reasoning pool when nothing specific is in flight.
 */
function poolForStep(latestStep: string | undefined): VerbPool {
  if (latestStep) {
    for (const { match, pool } of POOLS) {
      if (match.test(latestStep)) return pool;
    }
  }
  return GENERAL;
}

/**
 * Pure verb selector. Given the latest thought step and a monotonically
 * increasing tick, returns the verb to display right now.
 *
 * The pool is chosen from the step (Siri-style honesty); the tick rotates
 * within that pool (Claude-style liveliness). Pure and deterministic, so it is
 * trivial to unit-test and safe to call during render.
 */
export function spinnerVerb(latestStep: string | undefined, tick: number): string {
  const pool = poolForStep(latestStep);
  const i = ((tick % pool.verbs.length) + pool.verbs.length) % pool.verbs.length;
  return pool.verbs[i];
}

/** Exposed for tests: the stable id of the pool a step maps to. */
export function spinnerPoolId(latestStep: string | undefined): string {
  return poolForStep(latestStep).id;
}

// ---------------------------------------------------------------------------
// React hook — the renderer's single source of spinner-verb rotation.
// Kept here (next to the verb data) so every UKI surface — the overlay panel
// and the standalone chat — speaks with the same cadence and vocabulary.
// ---------------------------------------------------------------------------
import { useEffect, useState } from 'react';

/** How long each verb stays on screen before rotating, in ms. */
const ROTATE_MS = 1700;

/**
 * Drive a rotating, context-aware spinner verb. While `active`, the verb cycles
 * within the pool chosen from `latestStep`; when `active` flips off the tick
 * resets so the next thinking spell starts fresh rather than mid-rotation.
 */
export function useSpinnerVerb(active: boolean, latestStep?: string): string {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) { setTick(0); return; }
    const id = setInterval(() => setTick(t => t + 1), ROTATE_MS);
    return () => clearInterval(id);
  }, [active]);
  return spinnerVerb(latestStep, tick);
}
