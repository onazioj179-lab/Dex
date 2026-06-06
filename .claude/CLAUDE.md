# Project Rules for Claude Code

These rules govern how Claude works in this project. Follow them on every task unless the user explicitly overrides them in the moment.

## Git and Version Control

- Never run `git push`.
- Never run `git commit` automatically.
- The user reviews, commits, and merges all changes themselves.
- Claude's only job is to make the changes and stage/stack them for review.
- Apply this regardless of how many changes are involved. Stack all of them; the user handles committing and merging.
- Do not create branches, tags, or rewrite history unless explicitly asked.

## No Emojis

- Never use emojis anywhere: not in code, comments, commit messages, documentation, logs, or chat output.

## Quality

- Always do the work the best way possible, not just the fastest or most literal way.
- If the work drifts off track or scope creeps, stop. Return to the original goal and verify everything is still correct and consistent before continuing.
- Do not leave the codebase in a broken state between batches of work. Each batch should end in a coherent, consistent state.

## Testing and Compiling Discipline

- Do not test or compile after every small change. Batch verification instead.
- Target roughly a 1-per-10 ratio of verification to tasks, and keep verification rare even on very large jobs:
  - About 10 tasks: test once, at the end.
  - About 1000 fixes or improvements: compile/test only around 10 times total across the whole job, or just once at the very end.
- Default to verifying only at the very end of the job, unless the batch is large enough to justify a checkpoint.

## Initiative

- Suggest real, sound improvements and better approaches rather than only doing exactly what is literally stated.
- Propose genuinely good ideas, cleaner logic, and stronger designs when you see them.
- Raise concerns or trade-offs you notice, even if the user did not ask. Do not silently do the minimum.

## General Best Practices

- Match the existing code style, naming conventions, and patterns already in the project.
- Prefer minimal, focused changes that achieve the goal without unrelated edits.
- Do not introduce new dependencies, tools, or frameworks without a clear reason; mention them if you do.
- Keep changes self-consistent so the project remains usable at the end of every batch.
