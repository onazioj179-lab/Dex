// =============================================================================
// DEX Platform — Wave 0.1
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Licensed under the DEX Software License Agreement v1.0.
// =============================================================================
/**
 * ComputeRouter — the single entry point for "run this op". Resolves the
 * backend via BackendSelector and dispatches to the registered handler.
 *
 * Handlers are registered lazily by subsystems that own the implementation.
 * The router itself does not know how to do anything — it just routes.
 *
 * Usage:
 *   ComputeRouter.register('blur-gaussian', 'native-rust', nativeBlur);
 *   ComputeRouter.register('blur-gaussian', 'js', jsBlur);
 *   const result = await ComputeRouter.run('blur-gaussian', { side: 'main' }, input);
 */

import { pickBackend, type Backend, type Operation, type SelectionContext } from './BackendSelector';

export type Handler<I = unknown, O = unknown> = (input: I) => Promise<O> | O;

interface Registry {
  // op -> backend -> handler
  [op: string]: Partial<Record<Backend, Handler>>;
}

const handlers: Registry = {};

export class ComputeRouterImpl {
  register<I, O>(op: Operation, backend: Backend, handler: Handler<I, O>): void {
    if (!handlers[op]) handlers[op] = {};
    handlers[op]![backend] = handler as Handler;
  }

  has(op: Operation, backend: Backend): boolean {
    return !!handlers[op]?.[backend];
  }

  /**
   * Pick a backend that has both: (a) capability on this host, AND (b) a
   * registered handler. Falls through the preference list.
   */
  pick(op: Operation, ctx: SelectionContext): Backend {
    const ranked = pickAvailableHandlers(op, ctx);
    return ranked[0] ?? 'js';
  }

  async run<I, O>(op: Operation, ctx: SelectionContext, input: I): Promise<O> {
    const ranked = pickAvailableHandlers(op, ctx);
    let lastErr: unknown;
    for (const b of ranked) {
      const h = handlers[op]?.[b] as Handler<I, O> | undefined;
      if (!h) continue;
      try {
        return await h(input);
      } catch (err) {
        lastErr = err;
        // Fall through to next backend
      }
    }
    throw new Error(`ComputeRouter: no handler for op="${op}" backends=${JSON.stringify(ranked)}: ${String(lastErr)}`);
  }

  /** Test/debug — clear all registrations. */
  _resetForTest(): void {
    for (const k of Object.keys(handlers)) delete handlers[k];
  }
}

function pickAvailableHandlers(op: Operation, ctx: SelectionContext): Backend[] {
  const first = pickBackend(op, ctx);
  // Build full ordered fallback list: start with first pick, then any other
  // registered handlers as fallbacks.
  const registered = Object.keys(handlers[op] ?? {}) as Backend[];
  const ordered: Backend[] = [];
  if (handlers[op]?.[first]) ordered.push(first);
  for (const b of registered) if (b !== first) ordered.push(b);
  return ordered;
}

export const ComputeRouter = new ComputeRouterImpl();
