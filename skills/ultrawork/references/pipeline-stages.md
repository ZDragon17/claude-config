# Pipeline Stages —— 9 阶段执行细则

工件驱动的交付流水线。每个产码阶段以 **autoresearch-loop 收敛**收尾（不是 ultrawork 旧版的编译/测试弱验证）。两道人工闸不可自动越过。

## 阶段总览

| # | 阶段 | 输入 | 动作 | 产出 | 门禁 / 收敛 | 主要 agent |
|---|---|---|---|---|---|---|
| 0 | Constitution | 全局 rules + 项目红线 | 固化不可谈原则 | `.specify/constitution.md` | — | 主 agent |
| 1 | Intake + Clarify | 需求 + 材料 | 10 类歧义扫描 → AskUserQuestion 补齐 | `spec.md` | — | 主 agent（+ brainstorming） |
| 1.5 | **Design Contract** | spec | 边界/IO 契约 + 主逻辑链路 + 支线穷举 + 状态机 | `design.md` | — | 主 + code-architect |
| 2 | Plan | spec + design | 技术选型 / 架构 / 模块划分 | `plan.md` | — | plan / code-architect |
| 3 | Tasks + Analyze | spec + design + plan | 派生 DAG + 蜂群只读扫一致性/设计契约完整性；修到无 CRITICAL/HIGH | `tasks.md` + 报告 | Analyze：**CRITICAL 硬挡 / HIGH 默认挡（可放行并记录）** | 蜂群（general-purpose） |
| — | **人工闸①** | spec + design + plan + tasks + analyze 摘要 | 交用户确认**最终已校验工件**（重点审 边界/IO/主链路/支线，逐 MF 过支线表 + 状态机非法流转） | 确认 | **停等用户** | — |
| 4 | Implement（DAG-walk 每功能） | tasks | 狼群实现 → tester 功能测试 | 代码 + 测试 | **loop 收敛（scope=功能）** | 狼群 + Tester |
| 5 | Module | 功能节点 | 组模块 → 模块集成测试 | 模块 | **loop 收敛（scope=模块）** | 狼群 + Tester |
| 6 | System | 模块 | 串接 → 边界/IO 对齐 → 真 E2E | 系统功能 | **loop 收敛（scope=系统）+ real-e2e** | 主 + 狼群 |
| 6.5 | **安全合规门** | 系统 | SAST/SCA/secrets/覆盖率/容器扫 + 审计/访问/加密/可追溯 核对 | `audit-evidence.md` | **critical 硬挡 / high 默认挡**（enterprise-gates.md） | 主 + 蜂群:security |
| 7 | Hardening | 系统 | 终局异构复审 loop（+:security） | 复审报告 | 连续 N 轮 0 H/M + 安全清零 | 蜂群 + codex |
| — | **人工闸②** | 全部 | human-gate 3 卡点 + 推送/部署确认 | 确认 | **停等用户** | — |
| 8 | Deliver | 全部 | 对账 / diff / 风险清单 → commit/PR/(部署) | 交付报告 | — | 主 agent |

## 复杂度分级（沿用 IntentGate，决定是否全走 9 阶段）
- trivial / explicit（单文件、位置明确）→ **跳过 spec/plan 工件链**，直接改 + loop 收敛 + 交付。别用重流水线烧 token。
- moderate（2–3 文件）→ 轻量 spec（口头）+ 单线程实现 + loop 收敛。
- complex（3+ 模块 / 多维度）→ 全 9 阶段工件链 + 狼群 + 分层收敛。
- ambiguous → 只问一个澄清问题（或走 Clarify）再定级。

## 每阶段要点

- **Pre-flight IntentGate（前置门，不算 Stage）**：先跑意图分类（研究/实现/修复/评估/开放性变更）+ 复杂度分级；只有实现/交付类才进工件链。这是"是否进流水线"的门，与 Stage 0 工件阶段不同名不同义。
- **Stage 0 Constitution / Stage 1 Clarify**：Constitution 用 `assets/templates/constitution.md`；Clarify 见 `clarify-taxonomy.md`，spec 用 `assets/templates/spec.md`。
- **Stage 1.5 Design Contract**：用 `assets/templates/design.md` 落地 边界契约 + 逐接口 IO 契约 + 主逻辑链路 + **支线逻辑链路（分层清单，非穷举，按域补充）** + 状态机。闸①核心审核对象——behavior 写码前可审。
- **Stage 2 Plan**：`assets/templates/plan.md`（输入 constitution + spec + design），技术选型/架构/模块划分。
- **Stage 3 Analyze**：见 `analyze-gate.md`。蜂群只读扫 spec/design/plan/tasks 一致性 + 设计契约完整性。**CRITICAL 硬挡、HIGH 默认挡（可人工放行并记录）**；修到达标才进闸①（注：Analyze 只保证"内部一致/完整"，**语义正确由闸① + 基于 spec 的 Tester 兜底**）。
- **人工闸①**：spec + design + plan + tasks + analyze 摘要 定稿 → 复述 + AskUserQuestion 交确认；用户**逐 MF 过支线表 + 状态机非法流转**（不只一句话复述）。用户"可以"才写代码。**不可跳。**
- **Stage 4–7 收敛**：每层调 autoresearch-loop，`--scope` 逐层放大，见 `convergence-scoping.md`。功能测试由 **Tester agent** 写（绝不自己写测试）。real-e2e 见全局 `real-e2e-testing` 规则。
- **Stage 6.5 安全合规门（对外 SaaS 必过）**：见 `references/enterprise-gates.md` 的 G1–G11（含 G1b DAST）——SAST / DAST / SCA+SBOM / secrets / 覆盖率 / 容器扫 + 审计 / 访问控制 / 加密+KMS / 变更可追溯 / 可靠性 / 数据生命周期 核对；**critical 硬挡、绝对门 not-run=fail、high 默认挡（限时放行）**；证据产出 `assets/templates/audit-evidence.md`。**框架保技术控制就绪 + 证据链，"过认证"由组织 + 审计员完成**。
- **人工闸②**：命中 human-gate 3 卡点（金额/DDL/契约）即使流水线跑到这步也**强制停**；推送/部署前出对账+diff+风险清单等用户拍板。
- **Stage 8**：Conventional Commits；部署属生产变更（卡点2），DBA/运维双签后才执行。

## 时间诚实原则
- 一个真·后台管理系统到可部署 = 多轮、可能跨会话的工程。如实报进度与预估，**编译过绝不说完成**。
