# DEX — Remaining Work (active backlog)

Carried forward from the 7.0.1 pass and the Part 1/2 reports (`DEX_TUARI_SYSTEM_AUDIT_REPORT.md`,
`DEX_TAURI_PART2_IMPROVEMENT_REPORT.md`, which stay because they hold evidence and open items).

## Release blockers (7.0.1)
1. **Code signing**: needs a certificate; see `docs/SIGNING.md`. Installer is unsigned.
2. **MSI build** needs network (WebView2 bootstrapper download) or an offline bootstrapper; rebuild online.
3. **Packaged-app tests**: fresh install, upgrade over 6.x with data preserved, uninstall, startup/idle CPU/memory before-after.
4. **Click-through of the new slider** in a rendered Settings page, light and dark.
5. Full `vitest run` and e2e suites.
6. **PRIVACY.md correction** awaits owner approval (inputs in `docs/privacy/DATA_FLOWS.md`).

## Needs an owner decision
- Delete 6.1.0 build artifacts / old releases: only after 7.0.1 is installed and verified; rollback-critical.
- Downloadable app modules + native updater: needs hosting and a signing key; require signature verification when built.

## Not done from the 7.0.1 mandate
- Calculator visual refinement (two hard-coded gradient end colors; logic and unit tests pass).
- Light/dark audit of every built-in app, and 125/150/200% scaling checks.
- 888 off-scale inline radii inside apps (ratchet prevents growth); form-control border contrast.
- 70 of 149 Settings keys still read by nothing.
- Popup audit, live-activities completion, background-process audit beyond the Part 2 idle-CPU fix.
- Spatial desktop: FPS control, zones, creative-suite integration; minimap/persistence not re-verified.
- UI sound effects: no bundled audio files and no UI sound system found in a quick scan; not audited further.
- Full screen-reader pass.
- Obsolete task Markdown cleanup: not done; the two root reports still carry open items.
- Fix the CRLF shebang in `scripts/snap-radius-to-scale.mjs` (add a `.gitattributes` `eol=lf` rule for `*.mjs`).
