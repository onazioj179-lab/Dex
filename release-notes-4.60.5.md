# DEX v4.60.5

Stability, performance, and shell-polish release.

## Performance & thermal
- **Overheat fix:** under sustained low FPS the thermal monitor now disables *all* glass blur (`backdrop-filter`), not just inline-styled elements. Class- and token-based glass (panels, dock, frosted surfaces) was the dominant continuous GPU cost driving overheating/crashes on weaker machines. Applied dynamically and removed automatically once frame rate recovers — no app is unmounted.
- Background workers suspend (and free memory) when the window is minimized/hidden.
- Imosion decoded-audio cache is now bounded (was an unbounded long-session leak).

## Shell & UI
- **Dock reveal fixed:** the bottom hover zone is now full-width, so throwing the cursor to the bottom edge anywhere reveals the dock (the hover-intent gate still prevents accidental popups).
- Premium fluid-glass refinement across menus, panels, and toolbars (rim-lit edges, consistent radii, layered depth).
- Z-index layering corrected for Spotlight, Stage, and the Vinx context menu; tokenized previously hardcoded colors.
- Notification banner tint/border rendering fixed (invalid CSS that rendered transparent).
- Vinx video-clip color rendering fixed.

## Stability
- Full unit suite green on Windows: 4611 passing, 0 failing.
- Workspace snapshot crash-recovery hardened against partial/corrupt files.
- Dead code removed (CollaborationLayer, unused notification store).

> Note: this build is **unsigned**. Windows SmartScreen/Defender may warn on first launch.
