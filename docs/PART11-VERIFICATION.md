# DEX OS 7.0.1 — Part 11 verification ledger

Date: 2026-11-03 (America/Los_Angeles). Creator: Onazi Oj.

This is an active development record, not release acceptance. Existing uncommitted work was preserved. Parts 1–10 are not represented by a complete, uniquely identified checklist in this checkout; existing backlog and security audit documents remain authoritative for unresolved items.

## Implemented

- Shared `WorkspacePanel`: collapse/restore without unmounting content, saved width and visibility, bounded pointer resizing, spatial-scale correction, keyboard resizing and accessible expanded state. No resizing animation is introduced.
- Present: slide navigator and inspector adopt the shared panel; persistent focus mode hides both panels while retaining editing state. The slide fits the available viewport at its original 16:9 aspect ratio. Controls retain their normal size.
- Present: pointer-based block dragging supports touch and accounts for the displayed slide scale, including desktop transforms. Clicks no longer bubble to the slide and clear selection. Block movement is bounded by the slide.
- Present: editable project files preserve slides, block geometry, styles, themes and speaker notes. Imports validate schema/size/IDs/geometry and supported image addresses before replacing the deck; unknown fields are discarded and undo restores the previous slides. Exports download a fresh timestamped filename.
- Present: bounded document undo/redo, buttons and scoped Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z. Native input undo remains available. Autosave failures now show an alert instead of silently disappearing.
- Canvas: layers adopt the shared collapsible, resizable panel. Existing raster drawing, layer data and history are preserved.
- OS hooks: corrected parent-directory resolution for system configuration and boot files. Added opt-in UKI generation with explicit input files, pinned stub path, PE architecture and required-section checks, optional signature verification, refusal to overwrite artifacts and a separate EFI GRUB entry. Existing kernel/initramfs recovery entries remain.
- Desktop package, root lock metadata, Tauri application manifest/lock, generated OS metadata and ISO filename target 7.0.1. Historical release notes remain unchanged. Internal library versions retain their independent versions.

## Design references

Applied compact content-oriented toolbars and clear separation between content and navigation from [Apple toolbar guidance](https://developer.apple.com/design/human-interface-guidelines/toolbars). The workspace uses existing DEX surface/text/border tokens; slide artwork themes remain document content. This pass does not emulate native Liquid Glass rendering.

The UKI command contract follows [systemd ukify documentation](https://www.freedesktop.org/software/systemd/man/256/ukify.html). The build host must supply compatible pinned versions of ukify, binutils and systemd-stub; signing additionally needs sbsign/sbverify.

## Validation

- Shared-panel tests: persistence, state preservation, malformed stored geometry, keyboard bounds, scaled pointer resizing and cancellation.
- Document-history tests: undo/redo, branch invalidation, no-op updates and bounded retained snapshots.
- Presentation integration tests: selection, document changes through undo/redo and autosave failure feedback.
- Production renderer build: passed during implementation; final verification results are recorded below.
- UKI shell scripts: Bash syntax checks passed outside the restricted sandbox. WSL is not installed. No real kernel/initramfs/stub/signing inputs or boot environment were supplied, so image generation, signatures and boot are **not verified**.

Observed checks: 31 tests passed across the workspace/history/presentation suites and existing creative-action/component suites. After adding editable project files and focus-mode coverage, four focused suites passed (14 tests). `tsc --noEmit` passed during implementation. The production renderer build passed with 593 modules; existing large-chunk and mixed-import warnings remain. Attribution check passed for 2,222 files. Bash syntax checks passed for build-uki, post-image and post-build; UKI usage and missing-input guards passed. Scoped whitespace checks passed; the pre-existing design-tokens.css change has a trailing-whitespace warning outside this batch.

## UKI build inputs

On a Linux build host, set `DEX_BUILD_UKI=1` for the Buildroot post-image hook, with:

- `DEX_UKI_STUB`: pinned `linuxx64.efi.stub` file.
- `DEX_UKI_CMDLINE_FILE`: deployment-specific kernel command line, including a stable root identifier where required.
- `DEX_UKI_OS_RELEASE`: generated target os-release file.
- `DEX_UKI_KERNEL_VERSION`: actual kernel version.
- `DEX_RELEASE_VERSION=7.0.1`.
- Optional `DEX_UKI_SIGNING_KEY` and `DEX_UKI_SIGNING_CERT`: both required for signing, supplied outside source control.

Standalone invocation: `bash dex-os/scripts/build-uki.sh KERNEL INITRD CMDLINE_FILE OS_RELEASE KERNEL_VERSION OUTPUT.efi`. Output must not exist. The script builds in a temporary sibling directory and only promotes a validated artifact. Nothing installs to a disk, changes firmware or enrolls a certificate.

## Remaining acceptance work

- Audit every creative app against the requested workflows: actual repository apps include AXL, Forge, Imosion, Vinx, Notes, Canvas and PresentationBuilder. Branding in the request does not establish capability parity.
- Complete and verify missing import/export/project schemas, media rendering, typography, vector/group/selection workflows and file recovery per app. Presentation local image import exists: automated coverage checks format/size rejection, fitted placement, persisted image content and undo/redo. Actual image decoding and export still need native visual verification. Browser autosave currently retains a single deck, with explicit project-file import/export for additional decks. Pointer drags are grouped into one undo step.
- Extend workspace adoption and verify compact/high-DPI/touch layouts in the running native shell. Present can restore canvas space by collapsing panels; fully automatic compact navigation remains outstanding.
- Audit DexCode project/file/replace/terminal workflows and all native diagnostics. DexCode already has project, search, syntax and terminal modules; this pass does not certify them. No simulated diagnostics were added.
- Resolve native assistant authorization and atomic KV repository issues in `INTERNAL_PLATFORM_RUNTIME_AUDIT.md`. The assistant named UKI is distinct from Unified Kernel Images.
- Validate npm dependency lock parity; its pre-existing root dependency set differs from package.json. Only release version fields were changed here.
- Build and boot actual signed/unsigned UKIs in isolated EFI VMs, validate certificate trust, normal/recovery boot and rollback. Retaining GRUB recovery entries is not a successful recovery test.
- Repair and test hybrid ISO packaging, removable media and installer paths. Existing post-image behavior can skip ISO creation if xorriso is absent; this is not release acceptance. Do not write firmware/boot partitions without explicit authorization.
- Measure startup, memory/CPU/GPU usage, timeline latency, file/export performance and spatial interaction with real workloads. Renderer bundle warnings remain; build duration is not a runtime performance benchmark.
- Run full native/security/integration suites, package the app, smoke-test the installed artifact and reconcile all active release gates before publishing. No release was published.

Completed work is recorded here without deleting unresolved historical backlogs.

## Continuation checks — 2026-11-03

- Fixed shared ResizablePanel reset to respect minimum/maximum dimensions, notify resize consumers and support Enter/Space activation. Empty touch-move events are ignored safely.
- Added regression coverage for bounded pointer/keyboard reset and presentation image placement, persistence and undo/redo. The image test mocks file reading and decoding; it does not establish real decoder compatibility.
- TypeScript check passed. Production renderer build passed (595 modules), with existing large-chunk and mixed-import warnings.
- Six selected suites passed (22 tests); after adding image-placement coverage, the presentation suite passed again (6 tests). These runs cover 23 distinct tests in total.
- Existing installed DEX was not removed or replaced. Native packaging, installed-app smoke testing, full application acceptance and real UKI boot verification remain outstanding.

- Follow-up: Present inspector geometry now clamps positions and dimensions to the project schema bounds, preventing edits that cannot be reopened. Presentation suite passed (7 tests).
- Follow-up: TypeScript passed after inspector geometry changes. Project download now validates against the import contract and reports validation errors without changing the deck. Presentation suite passed (8 tests), including refusal to download unsupported legacy image addresses.
