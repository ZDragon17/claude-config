# 执行 DAG（Tasks）—— 可执行任务图

> 由 spec + plan 派生。每个节点带 契约 + 验收 + 测试命令 + 依赖 + 收敛层。
> 定稿后先过 **Analyze 门禁**（references/analyze-gate.md：蜂群只读扫 spec/plan/tasks 一致性，CRITICAL 挡下）再进实现。

## 收敛层（每层结束调 autoresearch-loop 收敛，--scope 逐层放大，见 references/convergence-scoping.md）
- **功能层**：单功能实现 + tester 功能测试 → loop 收敛（scope=该功能文件集）
- **模块层**：模块内功能齐 → 模块集成测试 → loop 收敛（scope=模块）
- **系统层**：模块串接 → 边界/IO 对齐 → 真 E2E（tmux+浏览器）→ loop 收敛（scope=系统）
- **终局层**：异构复审 loop（蜂群多视角 + codex）→ 0 H/M + 安全清零

## 任务节点

### T-1 <功能名>（模块 M-x，覆盖 FR-y）
- 依赖：[T-0, …]（无则空）
- 改动文件（无冲突分配，供狼群按文件拆）：
- 实现要点：
- 功能测试（tester authored，test-cmd）：`<命令>`
- acceptance（可观察结果，**不是"编译过"**）：
- 收敛层：功能

<!-- 复制节点块继续 T-2, T-3 … -->

## 人工卡点节点（命中 human-gate → 到此强制停，pipeline 不得自动越过）
| 节点 | 卡点类型 | 触发原因 |
|---|---|---|
