# Track P: Release & Deployment Pipeline Hardening

**Status:** continuous
**Release target:** v4.60.1 + ongoing
**Owner:** core

## Scope
Make the release pipeline strong, automated, and recoverable. Single `npm run validate` script; CI/CD on GitHub Actions; installer + dependency + plugin verification; auto-published docs; migrations; rollback; recovery.

## Files
- package.json (scripts)
- .github/workflows/validate.yml (new)
- .github/workflows/release.yml (new)
- scripts/release.js
- docs-site/DocGenerator.ts (wire into CI)
- migrations/<version>.ts (new pattern)

## Done
- [x] P1 — repo cleanup: transient `*_output.txt` removed from root and gitignored

## Next
- [ ] P2 — single `npm run validate`: tsc + vitest + lint + vite build + dist dry-run
- [ ] P3 — GitHub Actions: PR runs `validate`; main runs `validate` + `dist` + uploads artifacts
- [ ] P4 — package validation: installer signature verify; SHA256 check; blockmap integrity
- [ ] P5 — dependency verification: weekly `npm audit` + `cargo audit`; auto-PR for patches
- [ ] P6 — plugin packaging: versioned bundle format + signature + manifest schema validation
- [ ] P7 — docs auto-gen: wire docs-site/DocGenerator.ts into CI to publish docs/ to GitHub Pages on each release
- [ ] P8 — migrations: every release ships `migrations/<version>.ts`; auto-run on first launch; idempotent
- [ ] P9 — rollback: keep previous installer on disk; `--rollback` flag triggers reinstall
- [ ] P10 — recovery: extend crashRecovery to capture full state to disk every 30s; restore on next boot

## Blockers
- None

## Verification
- `npm run validate` exits 0 in CI
- Release artifacts SHA256-verified before tagging
- Rollback flow smoke-tested (install v4.60.1, rollback to v4.57.0, confirm app launches)

## Notes
- P is continuous. Each release improves it incrementally.
