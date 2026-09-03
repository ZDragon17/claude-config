---
description: Create a pull request with auto-generated title and description
---

1. Run `git status`, `git diff`, and `git log --oneline -20` to understand current changes
2. Determine the base branch (usually main or master or dev)
3. If there are uncommitted changes, commit them first following conventional commits format
4. Push the current branch to remote with `-u` flag
5. Create a PR using `gh pr create` with:
   - A concise title (under 70 chars) summarizing all changes
   - A body with:
     - ## Summary section with bullet points of key changes
     - ## Changes section listing modified files and what changed
   - Use the appropriate base branch

Do this automatically without asking for confirmation.
