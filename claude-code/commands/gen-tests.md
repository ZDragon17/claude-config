---
description: Generate comprehensive tests for specified code
---

Generate comprehensive tests for the specified code: $ARGUMENTS

1. Read the target code to understand its functionality
2. Identify the testing framework already used in the project (Jest, Vitest, JUnit, pytest, etc.)
3. Generate tests covering:
   - **Happy path** - Normal expected behavior
   - **Edge cases** - Empty inputs, boundary values, large inputs
   - **Error cases** - Invalid inputs, error handling, exceptions
   - **Integration** - Key interactions between components (if applicable)
4. Follow the existing test patterns and conventions in the project
5. Use descriptive test names that explain the expected behavior
6. Place test files according to project conventions

Write tests that are:
- Independent (no test depends on another)
- Deterministic (same result every time)
- Fast (mock external dependencies)
- Readable (clear arrange-act-assert pattern)
