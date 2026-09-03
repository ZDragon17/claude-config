---
alwaysApply: true
description: "常驻路由核心 — 意图选栈 + 蜂群/狼群 + 信号叠加。详细手册见 workflow-routing.md（按需 Read）"
---

# 路由核心（常驻精简版）

> 完整编排手册（典型组合范式、子命令路由、自学习沉淀）在 `workflow-routing.md`，需要时再 Read。
> 「该停」的硬边界永远高于本表，见 `human-gate.md`。

## 1. 按意图选基础栈

| 意图 | 信号词 | 基础栈 |
| --- | --- | --- |
| 探索/调研 | 看看/分析/调研/评估/找找 | 蜂群（多视角并行 read）→ 汇总 |
| 实现/开发 | 实现/添加/做一个/新增 | Plan → 狼群（按模块分工 write）→ 编译/测试 |
| 修 bug | 修/排查/根因/复现/失败 | debugger → 定位 → 改 → 测试验证 |
| 审查/评估 | 审/review/复核/扫一遍 | 蜂群（多 reviewer 并行）+ codex 二审（按需） |
| 完整交付 | 做完/搞定/端到端/ultrawork | ultrawork 全闭环（Plan→狼群→验证→交付） |

**编排铁律**：① 多工具/多信号主动组合，不退回单选 ② autoresearch 永远在最外层 ③ codex 复核按需且在最末 ④ UI 改动必须真实验证（见 `real-e2e-testing.md`）⑤ 复杂栈先复述再开跑。

## 2. 蜂群 vs 狼群（读写区分）

| 词 | 机制 | 用途 |
| --- | --- | --- |
| 蜂群 | subagent fanout，结果汇总回主 agent | 并行**读**：审查/评估/调研 |
| 狼群 | 多 agent 并行 write（默认 fanout，≥5 文件才升 Team） | 并行**写**：改代码/分模块修复 |

- 看/审/分析 → 蜂群；改/修/写/重构 → 狼群；用户点名哪个用哪个。
- **铁律：同一文件不能被两个 agent 同时编辑。**
- 自主开（无关键词）：≥3 个独立文件改动→狼群；多维度审查→蜂群；跨层修复→狼群。

## 3. 信号叠加（基础栈上加节点，不互斥）

| 信号词 | 追加节点 |
| --- | --- |
| 直到/循环/反复/多几轮 **或** 调到/压到/降到/达到/修到/控制在 + 阈值·数字·零报错·全绿·全过·不再复现 | 整栈外套 **autoresearch/goal-loop**（提取 metric → 复述确认 → 自收敛迭代；`max N 轮` 硬停，默认 6 最多 8；执行手册 `autoresearch-loop-execution.md`） |
| codex/二审/复核 | 末尾加 codex review（按需，见 `codex-review-policy.md`） |
| UI/前端/截图/看效果 | 末尾用浏览器真实打开验证（见 `real-e2e-testing.md`） |
| 盯/持续监控/等它跑完 | 整栈外套 loop 监控 |
| 安全/漏洞/红队 | 中段加 `security-reviewer` + `:security` |
| 性能/慢/P95/超时 | 中段加 `performance` 视角 + EXPLAIN |

**普通任务**（既无循环词、又无可量化目标）**不主动套循环**（省 token）。

## 4. 验证与停手（高于一切自动编排）

- **实证验证**：编译过 ≠ 功能可用；agent 干没干活看 `git diff` 不看自报（详见 `real-e2e-testing.md`）。
- **3 道人工卡点**（业务对账 / 生产变更 DDL·批量DML / 跨仓库契约）必须停下等人，详见 `human-gate.md`。
- **动作触发的按需规范**：`git merge` 远程分支 → `git-merge-remote-tracking.md`；发现 secret 误提交 → `git-secret-scrub.md`；推荐第三方库/工具前 → `license-constraints.md`。
