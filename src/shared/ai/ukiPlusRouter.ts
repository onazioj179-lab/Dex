// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
// UKI+ routing decisions.
//
// Pure helper that decides whether a UKI request should run on-device (NPU /
// CPU) or be sent to a cloud endpoint. Implements the "Deep AI Integration
// (uki+)" expectation from the May 2026 sweep:
//   - On-device when there is a known NPU AND the prompt is short / lightweight.
//   - On-device when the user is offline or has explicitly opted out of cloud.
//   - Cloud when the prompt requires retrieval / long context AND the device
//     can reach the cloud AND the user has not opted out.
//
// No IO. No fetch. The actual model invocation lives in the renderer / native
// layer; this only returns the dispatch decision.
// =============================================================================

export type UkiRoute = 'on-device' | 'cloud' | 'hybrid';

export interface UkiRouterInput {
  /** Current prompt text. */
  prompt: string;
  /** True when an NPU was detected on the host. */
  hasNpu: boolean;
  /** True when the host has internet connectivity. */
  online: boolean;
  /** True when the user has opted into cloud assistance. */
  cloudConsent: boolean;
  /** True when the user wants to keep all data on-device (privacy mode). */
  privacyMode: boolean;
  /** Approximate token budget the on-device model can handle. */
  onDeviceTokenBudget?: number;
}

export interface UkiRouterDecision {
  route: UkiRoute;
  reason: string;
  /**
   * Suggested truncation for the prompt when on-device, in characters.
   * Returned as `null` when no truncation is required.
   */
  promptCharLimit: number | null;
}

const DEFAULT_ON_DEVICE_TOKEN_BUDGET = 512;
/** Rough approximation: ~4 chars per token on English. */
const CHARS_PER_TOKEN = 4;
/** Long prompts probably require RAG/retrieval -- prefer cloud when allowed. */
const LONG_PROMPT_TOKEN_THRESHOLD = 200;

export function routeUkiRequest(input: UkiRouterInput): UkiRouterDecision {
  const tokenBudget = input.onDeviceTokenBudget ?? DEFAULT_ON_DEVICE_TOKEN_BUDGET;
  const promptTokens = approxTokens(input.prompt);
  const charLimit = tokenBudget * CHARS_PER_TOKEN;

  // 1. Privacy mode is non-negotiable -- never leaves the device.
  if (input.privacyMode) {
    return {
      route: 'on-device',
      reason: 'Privacy mode enabled; cloud disabled.',
      promptCharLimit: charLimit,
    };
  }

  // 2. Offline -> on-device only.
  if (!input.online) {
    return {
      route: 'on-device',
      reason: 'Offline; falling back to on-device model.',
      promptCharLimit: charLimit,
    };
  }

  // 3. No cloud consent yet -> on-device.
  if (!input.cloudConsent) {
    return {
      route: 'on-device',
      reason: 'Cloud consent not granted; running on-device.',
      promptCharLimit: charLimit,
    };
  }

  // 4. Long prompts benefit from cloud retrieval.
  if (promptTokens >= LONG_PROMPT_TOKEN_THRESHOLD) {
    return {
      route: 'cloud',
      reason: `Prompt is long (~${promptTokens} tokens); using cloud for retrieval.`,
      promptCharLimit: null,
    };
  }

  // 5. NPU present + short prompt -> on-device for latency wins.
  if (input.hasNpu && promptTokens <= tokenBudget) {
    return {
      route: 'on-device',
      reason: 'NPU detected and prompt fits on-device budget.',
      promptCharLimit: charLimit,
    };
  }

  // 6. Default: hybrid (try on-device first, escalate to cloud on failure).
  return {
    route: 'hybrid',
    reason: 'No NPU; trying on-device with cloud escalation.',
    promptCharLimit: charLimit,
  };
}

export function approxTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}
