# ContextBus

Typed pub/sub for cross-app activity inside DEX. Replaces ad-hoc
`window.dispatchEvent` patterns with a single, throttled, ring-buffered bus.

## Channels

| Channel              | Payload shape                                   | Notes                                           |
| -------------------- | ----------------------------------------------- | ----------------------------------------------- |
| `app:opened`         | `{ appId, ts }`                                 | Fired once per launch                           |
| `app:closed`         | `{ appId, ts }`                                 | Always after the cancellable close gate         |
| `app:focused`        | `{ appId, ts }`                                 | Fired on focus change (no echo)                 |
| `selection:changed`  | `{ source, value, ts }`                         | Selection in a text surface                     |
| `clipboard:updated`  | `{ source, kind, ts }`                          | DEX-internal clipboard sync                     |
| `file:saved`         | `{ path, app, ts }`                             | Persistent state writes                         |
| `file:opened`        | `{ path, app, ts }`                             |                                                 |
| `task:created`       | `{ id, app, ts }`                               | Tasks/Kanban/Notes                              |
| `task:completed`     | `{ id, app, ts }`                               |                                                 |
| `note:opened`        | `{ id, ts }`                                    | Notes app                                       |
| `note:saved`         | `{ id, ts }`                                    |                                                 |
| `workflow:trigger`   | `{ name, payload?, ts }`                        | Slash commands, automations                     |
| `idle:enter` / `idle:exit` | `{ ts }`                                  | User idle gate                                  |
| `ambient:hint`       | `{ kind, payload?, ts }`                        | Decorations/breathing/ambient context           |

## Throttle

`emit()` deduplicates rapid bursts inside a 16 ms window (one rAF tick).
For tests, call `ContextBus._setThrottle(0)` to disable. The 200-event ring
buffer is unaffected by throttling — the dropped event is simply not delivered
to handlers.

## Subscribing

```ts
import { ContextBus } from './services/ContextBus';

const off = ContextBus.on('app:focused', e => {
  console.log('focused', e.appId);
});

// Replay the most recent buffered event immediately, then keep listening
ContextBus.onWithReplay('app:opened', e => bootstrap(e.appId));

// Inspect history
const recent = ContextBus.replay('file:saved');
```

## Why not the DOM?

`window.dispatchEvent` is unstructured (events are strings, payloads are
`any`), un-throttled, and has no replay. ContextBus gives us a typed map,
ring-buffered history, and a single observable seam for tests, ambient AI
context, and the UKI command surface.
