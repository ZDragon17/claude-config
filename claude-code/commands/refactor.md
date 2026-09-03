---
description: Analyze and refactor code for better quality
---

Analyze the specified code ($ARGUMENTS or current file) and refactor it:

1. First READ the entire file to understand context
2. Identify refactoring opportunities:
   - Extract repeated code into functions/methods
   - Simplify complex conditionals
   - Improve naming for clarity
   - Reduce function length (aim for < 30 lines)
   - Apply appropriate design patterns
   - Remove dead code
3. Apply refactoring while:
   - Preserving ALL existing functionality
   - Maintaining the same public API/interface
   - Keeping the same test behavior
4. After refactoring, verify no functionality was broken

Do NOT over-engineer. Only refactor what genuinely improves readability and maintainability.
