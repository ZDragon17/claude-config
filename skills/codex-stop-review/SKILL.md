---
name: codex-stop-review
description: 在代码改动完成后按需调用 codex review，对 git diff 做异构第二视角审查。识别什么场景值得上 codex、什么场景跳过，避免「每次都审」的噪音和成本。Use when finishing a code change AND the diff matches the high-risk criteria below. Skip for low-risk diffs.
---

# Codex 异构复核 — 按需触发

## 核心原则

不是每次代码改动都需要 codex 复核。**按风险等级判定**——只在真有可能出 blocking semantics bug 的 diff 上调用，避免噪音和不必要的成本/延迟。

## 何时**必须**调用 codex review

满足以下任一条件就调用：

- **并发 / 异步**：涉及 `@Async` / `synchronized` / `volatile` / `Lock` / `AtomicXxx` / 线程池配置 / `CompletableFuture` / 多线程协调
- **状态机 / 幂等 / 重试**：涉及 SETNX / dedup / idempotency / `@Transactional` 跨多次写入 / retry counter / 状态转换 / event publish
- **跨模块协作**：改动跨 ≥ 2 个 module 且涉及契约（接口签名、event payload、DB schema、Redis key 约定）
- **安全/权限**：authn/authz / token / 加密 / SQL 拼接 / 用户输入处理
- **数据完整性**：批量更新 / 删除 / 外键级联 / 唯一约束 / migration
- **金额/计费**：任何涉及 money/balance/payment 的逻辑
- **明确的「这个改动有点抖」直觉**：写完自己心里不踏实——这是最可靠的信号

## 何时**应该跳过**

- 纯文档 / 注释 / 配置项小改（< 10 行无逻辑）
- 单文件单方法的 typo / rename / 简单 bugfix（无并发、无状态、无外部交互）
- UI 样式调整（不涉及业务逻辑）
- 测试用例补充（不涉及生产代码改动）
- 用户明确说"这次不用 codex"
- 已经在同一会话中刚审过一次相近改动（避免重复）

## 如何调用

**优先用 `codex review` 子命令**（专为代码审查设计，比 `codex exec` 更聚焦）：

```bash
# 审最近一次 commit
codex review --commit HEAD

# 审工作区未提交改动（包括 staged + unstaged + untracked）
codex review --uncommitted

# 审 vs 主分支（PR 场景）
codex review --base master
```

**重要：`--commit` / `--uncommitted` / `--base` 跟自定义 PROMPT 不能同时给**（CLI 限制）。
如果要带自定义重点 prompt，去掉 `--commit` 之类的范围 flag，单独传 prompt：

```bash
# 仅 prompt 模式（codex 默认审最近改动）
codex review "重点关注：并发 race / 幂等性 / dedup 是否完整。
不需要风格建议、不需要测试补充建议、不需要拼写检查。
只列 blocking / high 级别的真实风险。"
```

或先 commit、然后用 `--commit HEAD` 走默认 review（codex 默认 prompt 已经聚焦在 blocking）。实测默认 prompt 也能抓出 deployment-level blocking（SQL schema、migration、迁移路径），不一定非要自定义。

## 输出处理

- codex 的原话**不要转述**——把它的关键 finding 原文给用户看
- 如果 codex 抓到 blocking → 先修再交付（commit / PR）
- 如果 codex 全 pass → 一句话总结"codex 审过无 blocking"
- 如果 codex 和我意见冲突 → **优先客观信号（测试 / 运行结果）裁决**；客观信号无法裁决时列双方观点交给用户拍板

## 调用前的自检

在真正 spawn codex 进程前先问自己：

1. 这个 diff 涉及上面列的「必须」criteria 任一条吗？
2. 我自己 review 完真的没有不踏实的地方吗？

两个都是「否」→ **跳过 codex，直接交付**。这是节省成本的关键决策点。

## 跟之前默认行为的差异

旧规则（已废弃）：「每次代码改动后默认召 codex」  
新规则：**按风险等级判定，简单改动不上 codex**

理由：3 case tribunal 实验显示——主 blocking bug 多数能被 Claude 自己抓到；codex 的真正价值在「并发/状态机/幂等」这类 *视角组合型* bug。低风险 diff 上 codex 是浪费。

## 模式 B（用户明示触发）保留

用户说「让 codex 出方案」「codex 出题我来做」「B 模式」时——切 Codex 主导：

1. 我先用 `codex exec --skip-git-repo-check -` 让 codex 出实现方案
2. 我评估方案 + 落地实现
3. 跑通客观验证
4. `codex review --uncommitted` 复核实现是否偏离原方案

模式 B 不受「按需判定」约束——用户明示触发就走完整流程。
