// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * Pure transform pipeline (AutomationEngine step chains). Runs an input through
 * an ordered list of named transform steps, stopping at the first failure and
 * reporting where it stopped — so automations have predictable, testable
 * sequencing without owning side effects. Pure: no DOM, no IO, no async.
 */

export interface PipelineStep<T> {
  name: string;
  run: (input: T) => T;
}

export interface PipelineResult<T> {
  value: T;
  ok: boolean;
  /** Names of steps that completed successfully, in order. */
  completed: string[];
  /** The step that threw, if any. */
  failedAt?: string;
  error?: string;
}

/** Run `input` through `steps`, stopping at the first thrown error. */
export function runPipeline<T>(input: T, steps: ReadonlyArray<PipelineStep<T>>): PipelineResult<T> {
  let value = input;
  const completed: string[] = [];
  for (const step of steps) {
    try {
      value = step.run(value);
      completed.push(step.name);
    } catch (err) {
      return {
        value,
        ok: false,
        completed,
        failedAt: step.name,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  return { value, ok: true, completed };
}

/** Compose steps into a single transform that throws on the first failure. */
export function composeSteps<T>(steps: ReadonlyArray<PipelineStep<T>>): (input: T) => T {
  return (input: T) => {
    const result = runPipeline(input, steps);
    if (!result.ok) throw new Error(`pipeline failed at "${result.failedAt}": ${result.error}`);
    return result.value;
  };
}
