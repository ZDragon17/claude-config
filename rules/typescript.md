---
globs: ["*.ts", "*.tsx", "*.mts", "*.cts"]
description: "TypeScript best practices and patterns"
---

# TypeScript Rules

## Type Safety
- Use strict TypeScript configuration
- Avoid `any` - use `unknown` for truly unknown types
- Prefer interfaces for object shapes, types for unions/primitives
- Use const assertions for literal types: `as const`

## Patterns
- Use discriminated unions for state management
- Prefer `readonly` for immutable data
- Use generics for reusable type-safe code
- Extract complex types to separate files

## Imports
- Use type-only imports: `import type { X } from 'y'`
- Prefer named exports over default exports
- Group imports: external → internal → types

## Error Handling
- Create custom error classes extending Error
- Use Result/Either pattern for expected failures
- Type guard functions for runtime validation
