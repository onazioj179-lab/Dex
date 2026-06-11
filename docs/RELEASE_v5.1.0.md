# DEX v5.1.0 — Release Checklist

Prepared for review. **Nothing here has been pushed or published** — every
outward-facing step below is yours to run when you are ready. The code, version
bump, changelog, and in-app "What's New" are staged in the working tree.

## What changed in this release

See `docs/CHANGELOG.md` (v5.1.0 entry) for the user-facing notes. In short:
DEX is now 100% free (all tiers unlocked), plus compact always-on-top mode,
workspace recovery, instant background updates, a sharper interface, a
reimagined Nexus, deeper Notes, a high-contrast theme, and perf fixes.

## Repository topology

- **Source repo:** `onazioj179-lab/Dex` (git remote `origin`).
- **Public update feed:** `onazioj179-lab/dex-updates` — where built installers
  and `latest.yml` are published for auto-update. (`build.publish` in
  package.json currently points at `Dex`; if the auto-updater should pull from
  `dex-updates`, switch `repo` there before building — see step 4.)

## Pre-flight (already done in the working tree)

- [x] `package.json` version bumped 5.0.1 -> 5.1.0
- [x] `docs/CHANGELOG.md` v5.1.0 entry written
- [x] In-app What's New entries updated (`WhatsNewModal.tsx`)
- [x] `npm run lint` (tsc + watermark) green
- [x] `npm run build` (renderer + main) green

## Your steps (run these yourself)

1. **Review the staged diff** and confirm scope:
   `git status` then `git diff --cached`
2. **Commit** (your call on message; a suggested one is in `docs/RELEASE_NOTES.md`):
   `git commit` — then push the feature branch and open a PR into `main`.
3. **Tag** the release after merge:
   `git tag v5.1.0 && git push origin v5.1.0`
4. **Confirm the update feed target.** If auto-update should serve from
   `dex-updates`, set `build.publish.repo` to `dex-updates` in package.json.
   Code signing credentials must be present for `--publish` (the release script
   exits early without them — see `scripts/release.js`).
5. **Build + publish installers** with the existing scripts:
   - Windows: `npm run release:win`
   - macOS:   `npm run release:mac`
   - Linux:   `npm run release:linux`
   - Or full signed publish: `npm run release:publish`
6. **Prune old releases** to keep the feed lean (keeps current + 2 prior):
   `npm run release:prune:all`
7. **Verify auto-update** end to end: install the prior version, launch, confirm
   it detects v5.1.0, downloads in the background, and installs on quit.

## Notes / decisions still yours

- **Legal/policy text.** The tier and advertising wording in
  `src/shared/policyDocuments.ts` (Terms section 8), `docs/PRICING.md`, and
  `docs/TERMS.md` still describes paid plans and ad-supported tiers. Now that
  DEX is fully free, this text should be revised — left untouched pending your
  sign-off, as legal copy is yours to own.
- **Payment infrastructure** is hidden behind a reversible flag
  (`PAYMENTS_ENABLED` in `AccountSettingsCard.tsx`), not deleted, so paid tiers
  can be reintroduced later without rebuilding the system.
