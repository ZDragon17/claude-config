---
globs: ["*.py", "*.pyi", "**/python/**"]
description: "Python best practices and patterns"
---

# Python Rules

## Style
- Follow PEP 8 and PEP 257 (docstrings)
- Use type hints for all function signatures
- Maximum line length: 88 (Black formatter)
- Use f-strings for string formatting

## Structure
- One class per file for complex classes
- Use `__all__` to define public API
- Prefer composition over inheritance
- Use dataclasses/Pydantic for data containers

## Imports
- Sort with isort: stdlib → third-party → local
- Avoid wildcard imports `from x import *`
- Use absolute imports in packages

## Error Handling
- Create custom exception hierarchy
- Use context managers for resources
- Log exceptions with full traceback
- Prefer EAFP over LBYL

## Performance
- Use generators for large sequences
- Profile before optimizing
- Consider async/await for I/O bound tasks
- Use `__slots__` for memory optimization
