---
description: Quick commit - auto-generate message and commit without confirmation
---

Look at the staged and unstaged changes using `git diff` and `git status`.

Generate 3 commit message suggestions following conventional commits format:
- type(scope): description
- Types: feat, fix, refactor, docs, style, test, chore, perf, ci, build
- Keep the first line under 72 characters
- Use Chinese or English based on the majority language of the changes

Automatically select the FIRST suggestion without asking me. Run `git add` for relevant files (never add .env or credential files) and then `git commit` with the selected message immediately.

Do NOT add any Co-Authored-By footer.
Do NOT ask for confirmation - just commit directly.
