---
description: Comprehensive code review on current changes
---

Perform a thorough code review on the current changes.

1. Run `git diff` to see all changes (or review $ARGUMENTS if provided)
2. Review each change for:

**Correctness**
- Logic errors, off-by-one errors, null/undefined handling
- Edge cases not covered
- Race conditions or concurrency issues

**Code Quality**
- Naming clarity and consistency
- DRY violations (duplicated code)
- Function/method length and complexity
- Proper error handling

**Performance**
- N+1 queries, unnecessary loops
- Memory leaks, large object retention
- Missing indexes for database queries
- Unnecessary re-renders (for frontend)

**Best Practices**
- Following project conventions
- Proper typing (TypeScript/Java etc.)
- Test coverage for new code

Provide feedback as:
- **MUST FIX**: Bugs or critical issues
- **SHOULD FIX**: Code quality improvements
- **CONSIDER**: Nice-to-have suggestions

Be concise and actionable. Reference specific line numbers.
