// =============================================================================
// DEX Platform
// Copyright (c) 2026 Onazi Treasure OJ. All rights reserved.
// Created by Onazi Treasure OJ <onazi75@gmail.com>
// Licensed under the DEX Software License Agreement v1.0. See LICENSE.
// =============================================================================
/**
 * useAppLifecycle — the opt-in surface for the AppLifecycle protocol.
 *
 * An app subscribes once with handlers that release/re-acquire its heavy
 * resources, and gets back the current phase for render branching:
 *
 *   const phase = useAppLifecycle('vinx', {
 *     onBackground: () => engine.current?.pauseRaf(),
 *     onSuspend:    () => engine.current?.releaseGL(),
 *     onResume:     () => engine.current?.reacquireGL(),
 *     onForeground: () => engine.current?.resumeRaf(),
 *   });
 *
 * Handlers are read through a ref so passing fresh inline closures every render
 * does not re-subscribe. Apps that never call this keep today's keep-alive
 * behavior (always warm).
 */

import { useEffect, useRef, useState } from 'react';
import {
  appLifecycle,
  applyPhaseTransition,
  type AppLifecycleHandlers,
  type AppPhase,
} from '../services/AppLifecycle';

export function useAppLifecycle(
  appId: string,
  handlers: AppLifecycleHandlers = {},
): AppPhase {
  const [phase, setPhase] = useState<AppPhase>(() => appLifecycle.getPhase(appId));
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    // Reconcile against any phase set before this subscription mounted, so an
    // app that opens directly into the foreground still fires onForeground.
    const initial = appLifecycle.getPhase(appId);
    setPhase(initial);

    const unsub = appLifecycle.subscribe(appId, (next, prev) => {
      setPhase(next);
      applyPhaseTransition(prev, next, handlersRef.current);
    });
    return unsub;
  }, [appId]);

  return phase;
}

export default useAppLifecycle;
