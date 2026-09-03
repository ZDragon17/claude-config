---
description: Systematically diagnose and fix a bug
---

Systematically diagnose and fix the reported bug: $ARGUMENTS

1. **Understand** - Read the bug description and identify affected area
2. **Reproduce** - Find the relevant code and understand the current behavior
3. **Diagnose** - Trace the code flow to find the root cause:
   - Check recent changes with `git log` and `git diff` if relevant
   - Read related files to understand context
   - Look for common causes: null refs, type errors, race conditions, wrong logic
4. **Fix** - Apply the minimal fix that addresses the root cause:
   - Don't refactor unrelated code
   - Don't add unnecessary abstractions
   - Keep the fix focused and small
5. **Verify** - Run related tests if they exist, or explain how to verify the fix
6. **Report** - Summarize:
   - Root cause
   - What was fixed
   - Files changed
   - How to verify
