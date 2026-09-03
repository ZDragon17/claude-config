---
alwaysApply: false
description: "Codex 异构复核 — 按需判定是否调用 codex 二审，高风险场景强制调用，低风险跳过以节省成本"
---

# Codex 异构复核策略（全局）

代码改动完成后**按需判定**是否调用 codex 复核——不是每次都跑，也不是从不跑。

## 必须调用 codex review 的场景

满足任一即调用：

- **并发 / 异步**：`@Async` / `synchronized` / `volatile` / `Lock` / 线程池 / `CompletableFuture` / 多线程协调
- **状态机 / 幂等 / 重试**：SETNX / dedup / idempotency / `@Transactional` 跨多次写入 / retry counter / 状态转换 / event publish
- **跨模块协作**：改动跨 ≥ 2 个 module 且涉及契约（接口签名、event payload、DB schema、Redis key 约定）
- **安全 / 权限**：authn/authz / token / 加密 / SQL 拼接 / 用户输入处理
- **数据完整性**：批量更新/删除 / 外键级联 / 唯一约束 / migration / DROP
- **金额 / 计费 / 部署脚本**：任何 money/balance/payment 或会被运维直接执行的脚本
- **自己心里不踏实**：写完不放心——最可靠的直觉信号

## 应该跳过的场景

- 纯文档 / 注释 / 配置项 < 10 行无逻辑
- 单文件单方法的 typo / rename / 简单 bugfix（无并发、无状态、无外部交互）
- 纯 UI 样式调整（不涉业务逻辑）
- 测试用例补充（不涉生产代码）
- 用户明确说"这次不用 codex"
- 同会话刚审过相近改动

## 调用方式

### 工具选择决策表（5 选 1）

| diff 性质 | 用 | 为什么 |
|---|---|---|
| **普通改动 + 想快速二审** | `/codex:review` | slash command，UI 渲染好，结果有结构化展示，比裸 Bash 顺手 |
| **高风险**（并发/状态机/幂等/金额/安全） | **`/codex:adversarial-review`** | 对抗式复核，挑战实现思路和设计 — 最贴合本规则「异构二审」本意 |
| **卡死 / 需要救援 / 探索性 bug** | `/codex:rescue` | 委派给 rescue subagent，独立调查不打断主线 |
| **想审最近 commit 或 vs base 分支** | `codex review` Bash | slash command 默认审工作区；要审 `HEAD` / `--base master` 等用 CLI |
| **快速本地 lint 类纯文本批注** | `/code-review` | 不调 codex，只是本地 review 工具，零延迟 |

`codex-stop-review` skill = 本规则的执行手册（不是工具），自检触发条件时读它。

### Bash 调用回退（CLI 形式）

slash command 出错或 batch 场景用 Bash 兜底：

```bash
codex review --commit HEAD        # 审最近一次 commit
codex review --uncommitted        # 审工作区未提交改动
codex review --base master        # 审 vs 主分支（PR 场景）
```

注意：`--commit` / `--uncommitted` / `--base` 跟自定义 PROMPT **不能同时给**（CLI 限制）。

## 输出处理

- codex 的原话**不要转述**——直接给用户看
- blocking → 先修再交付（commit / PR）
- 冲突时优先客观信号（测试/运行结果）裁决；无法裁决交用户拍板

## 调用前自检

- 命中「必须」criteria 任一条？
- 自己 review 完真的没不踏实？

两个都「否」→ 跳过 codex 直接交付。**这是节省成本的决策点**。

## 模式 B（用户明示）

用户说「让 codex 出方案」「codex 出题我来做」「B 模式」→ 切完整 B 流程：
1. `codex exec --skip-git-repo-check -` 出方案
2. 我评估 + 实现
3. 跑客观验证
4. `codex review --uncommitted` 复核

模式 B 不受按需判定约束。

## 配套 skill

详细执行手册见 `codex-stop-review` skill（`~/.claude/skills/codex-stop-review/SKILL.md`）。本规则是 anchor，skill 是 manual。

## 决策依据（按需而非每次的来由）

旧版（已废弃）：A 默认每次都走 codex review，避免单一源盲区。

新版（2026-05-14 生效）：根据 tribunal 实验复盘（3 个 commit case），实证发现 —
- 主 blocking bug 多数 Claude 自己也能抓到
- Codex 的真正高 ROI 在「并发/状态机/幂等」这类视角组合型 bug
- 低风险 diff 上 codex 是噪音和延迟成本浪费
- 用户原话："不是每次对话都需要 codex 审核的，按需判定"

所以现在默认按需判定，但「自己心里不踏实」始终是兜底信号。
