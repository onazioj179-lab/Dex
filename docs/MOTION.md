# Motion (hybrid model)

DEX motion uses two complementary systems:

1. **`SPRING_PRESETS`** for layout, drag/release, window snap — anything that
   benefits from natural overshoot.
2. **`LINEAR_PRESETS`** for input feedback, hover, focus, fade, and progress —
   anything where overshoot would feel laggy or sloppy.

Both honour `prefers-reduced-motion` automatically: a reduced-motion user gets
`0ms linear` regardless of which preset is requested.

## Linear preset table

| Preset       | Duration | Use case                                              |
| ------------ | -------- | ----------------------------------------------------- |
| `instant`    | 60 ms    | Microclick, ripple flash                              |
| `micro`      | 80 ms    | Button background/border, small color shifts          |
| `hover`      | 100 ms   | Card hover surface, subtle elevation                  |
| `focusGlow`  | 100 ms   | Text input focus ring                                 |
| `fade`       | 120 ms   | Tooltip/popover fade in/out                           |
| `reveal`     | 140 ms   | Tab switch chrome, dropdown open                      |
| `progress`   | 200 ms   | Progress bar fill, ETA tick, meter peak decay         |
| `scrub`      | 0 ms     | Continuous drag follow (no easing)                    |

## Helpers

```ts
import { cssTransition, cssTransitions } from '../utils/MotionController';

style.transition = cssTransition('opacity', 'fade');
style.transition = cssTransitions(['background', 'color'], 'micro');
```

The returned strings are reduce-motion-safe.

## Spring presets

See `SPRING_PRESETS` in [src/renderer/utils/MotionController.ts](src/renderer/utils/MotionController.ts).
The canonical layout spring is `gentle`; window snap uses `responsive`; drag
release uses `loose`.

## Where each is used

| Surface                             | System                |
| ----------------------------------- | --------------------- |
| Window drag / snap                  | spring (`responsive`) |
| Modal in/out                        | spring (`gentle`)     |
| Button background hover             | linear (`micro`)      |
| Card hover                          | linear (`hover`)      |
| TextInput focus ring                | linear (`focusGlow`)  |
| Tooltip / popover fade              | linear (`fade`)       |
| Progress bar / meter                | linear (`progress`)   |
