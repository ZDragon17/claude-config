---
globs: ["*.tsx", "*.jsx", "**/components/**", "**/hooks/**"]
description: "React best practices and patterns"
---

# React Rules

## Components
- Prefer functional components with hooks
- Keep components small and focused (< 200 lines)
- Use composition over prop drilling
- Memoize expensive computations with useMemo/useCallback

## Hooks
- Custom hooks should start with `use`
- Keep hooks at top level, not inside conditions
- Use useReducer for complex state logic
- Cleanup effects properly

## Performance
- Use React.memo for expensive pure components
- Virtualize long lists (react-window, react-virtualized)
- Lazy load routes and heavy components
- Avoid inline function definitions in JSX

## State Management
- Lift state up only when needed
- Use context for truly global state
- Consider Zustand/Jotai for complex state
- Keep server state separate (React Query/SWR)

## Accessibility
- Use semantic HTML elements
- Add proper ARIA attributes
- Ensure keyboard navigation
- Test with screen readers
