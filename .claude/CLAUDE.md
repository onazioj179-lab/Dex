# DEX — project rules

## Git / commit policy
- Do NOT add AI-attribution trailers to commit messages or PR bodies. Never append
  `Co-Authored-By: Claude … <noreply@anthropic.com>`, `🤖 Generated with [Claude Code]`,
  or any "Generated with" watermark. Legitimate human `Co-Authored-By:` lines are fine.
- A `commit-msg` hook enforces this. Enable it once per clone:
  `git config core.hooksPath .githooks`
  (Existing worktrees also have an active copy in `.git/hooks/commit-msg`.)
