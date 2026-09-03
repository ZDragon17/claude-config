# Claude Code 桥接入口

> 权威源是 `AGENTS.md`（跨 agent 通用层）。本文件只做 Claude Code 的加载桥接：
> CC 通过 `@import` 让常驻规则**自动加载**；其他 agent 直接读 `AGENTS.md` 并按需 Read `rules/`。

@AGENTS.md

## 常驻规则全文自动加载（CC 专属机制，单一信源在 rules/）

@rules/routing-core.md
@rules/human-gate.md
@rules/user-profile.md
@rules/always-apply.md
@rules/autonomous-judgment.md
@rules/real-e2e-testing.md
@rules/minimal-edit.md

> 其余 rules/ 为按需手册（workflow-routing / autoresearch-loop-execution / 各语言与领域规范等），需要时主动 Read，不常驻占 context。
