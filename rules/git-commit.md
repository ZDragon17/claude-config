---
globs: ["COMMIT_EDITMSG", ".git/**"]
description: "Git commit message conventions"
---

# Git Commit Rules

## Conventional Commits
格式: `<type>(<scope>): <description>`

## Types
- feat: 新功能
- fix: Bug 修复
- docs: 文档更新
- style: 代码格式（不影响功能）
- refactor: 重构（不新增功能或修复 bug）
- perf: 性能优化
- test: 测试相关
- build: 构建系统或外部依赖
- ci: CI 配置
- chore: 其他杂项

## 规范
- 标题不超过 50 字符
- 使用祈使语气 (Add, Fix, Update)
- 不以句号结尾
- 正文与标题空一行
- 正文每行不超过 72 字符

## 示例
```
feat(auth): add JWT token refresh mechanism

- Implement refresh token endpoint
- Add token rotation on refresh
- Set 7-day expiry for refresh tokens

Closes #123
```
