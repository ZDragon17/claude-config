---
name: ultrawork
description: >
  全自主分层交付流水线。工件驱动的完整 SDLC：意图分析 → 澄清 → spec/plan/tasks 工件链 →
  分层实现（功能/模块/系统，每层以 autoresearch-loop 收敛）→ 异构复审 → 交付。
  loop engineering 是每层的收敛内核（不重写、不丢弃）；两道人工闸（架构确认、推送/部署）不可自动越过。
  不允许编译通过就说"搞定"，必须真实验证功能可用。
when_to_use: >
  用户说 "ultrawork"、"ulw"、"全自动"、"把这个功能做完"、"帮我搞定"、"修完这些"、
  "端到端做完"、"从头到尾搞定"、"做一个 XX 系统" 时触发；或任何需要完整
  "需求 → 规划 → 实施 → 验证 → 交付" 闭环的复杂任务。
user-invocable: true
argument-hint: "[任务描述，如：做一个后台管理系统 / 实现日志告警分级]"
effort: high
---

# Ultrawork —— 全自主分层交付流水线

一个工件驱动的完整交付管道，不是问答助手。用户声明意图后，接管从澄清、规划、实现到验证的全部步骤。**停手点仅限这几处**：Pre-flight 必要澄清、人工闸①、human-gate 3 卡点、人工闸②（推送/部署）、连续失败阻塞上报；其余自主推进、不打扰。

## 核心原则

1. **loop = 收敛原语，不重写、不丢弃**。每个产码检查点调用 `autoresearch-loop`（蜂群多视角 → 狼群修 → verify → 连续 N 轮收敛；**codex 异构二审按需（见 codex-review-policy），终局 Stage 7 强制**）。它是 Anthropic evaluator-optimizer 模式的落地；狼群是 orchestrator-workers。
2. **intent = 单一信源**。工件链 constitution → spec → design → plan → tasks 逐阶段喂下游，代码由工件派生（借鉴 GitHub Spec-Kit）。
3. **确定性骨架 + LLM 当 worker**。主 agent 掌控流程与判停；`human-gate.md` 最高优先。
4. **编译过 ≠ 完成**。每层验证按 real-e2e-testing 的 Level 1–4 递进，真跑才算过。

## Pre-flight — IntentGate（意图分类 + 复杂度分级，前置门，非 Stage 0）

先分类意图并**言语化声明**：`检测到 [研究/实现/调查/评估/修复/开放性变更] 意图 — [原因]。执行方案：[路由]。`

| 意图 | 信号 | 路由 |
|---|---|---|
| 研究/调查 | 解释X / 看看 / 什么是 | 探索 + 汇报，不改代码（不进流水线） |
| 修复 | Bug / 报错 / 测试失败 | 最小诊断 → 仅修该问题 → loop 收敛 |
| 评估/开放性 | 怎么看 / 重构 / 优化 | 评估 → 提议 → **等确认** |
| 实现/交付 | 实现X / 做一个 / 搞定 / 端到端 | **进下方工件驱动流水线** |

**复杂度分级（决定裁剪多少流水线，避免简单任务烧 token）：**
- trivial / explicit（单文件、位置明确）→ 跳过工件链，直接改 + loop 收敛（scope=改动）+ 交付。
- moderate（2–3 文件）→ 轻量口头 spec + 单线程实现 + loop 收敛。
- complex（3+ 模块 / 多维度）→ **全工件链 + 狼群 + 分层收敛**（下方全程）。
- ambiguous → 先走 Clarify（或只问一个澄清问题）再定级。

## 工件驱动流水线（complex 走全程；轻任务按上表裁剪）

9 阶段总表与每阶段细则见 **`references/pipeline-stages.md`**。要点：

- **Stage 0 Constitution**：用 `assets/templates/constitution.md` 固化项目红线（技术栈 / 测试要求 / human-gate / 收敛标准）。复用全局 rules，只补项目特有。
- **Stage 1 Intake + Clarify**：先按 **`references/clarify-taxonomy.md`** 的 10 类扫歧义 → AskUserQuestion 一次问清 → 回填 `assets/templates/spec.md`。spec 只写 WHAT/WHY + 边界 + IO + 验收，每条可测。
- **Stage 1.5 Design Contract**：用 `assets/templates/design.md` 落地 **边界契约 + 逐接口 IO 契约 + 主逻辑链路 + 支线逻辑链路（分层清单，非穷举，按域补充） + 状态机** —— 这是"设计之初就想好、交你审"的核心 artifact，behavior 写码前就可审（比 spec-kit 多这一层）。
- **Stage 2 Plan**：`assets/templates/plan.md`（输入 constitution + spec + design），技术选型 / 架构 / 模块划分（可用 plan、code-architect agent）。
- **Stage 3 Tasks + Analyze**：派生可执行 DAG（`assets/templates/tasks.md`）→ 过 **`references/analyze-gate.md`**（蜂群只读扫 spec/design/plan/tasks 一致性 + 设计契约完整性；**CRITICAL 硬挡、HIGH 默认挡（可放行并记录）**，修到达标）。
- **★人工闸①**：spec + design + plan + tasks + analyze 定稿后交用户确认。确认材料**必须压缩成一页「决策点清单」**——只列真需要人拍板的分叉：技术选型及备选、对外契约（接口/事件/schema）、不可逆操作、被 analyze 标记为 HIGH 的风险、支线表中行为有歧义的 MF、状态机的非法流转处置。每条一行（决策点 + 推荐 + 理由 ≤20 字），**不要求用户审全量设计**（全量人工审会被跳过，闸就形同虚设）。用户逐条拍板或整体说"按推荐"后才写代码。**这是"交你确认"，不可跳。**
- **Stage 4–6 分层实现**：DAG-walk。每层 = 狼群实现（文件无冲突）→ **Tester agent 写功能测试**（绝不自己写测试）→ **autoresearch-loop 收敛**（`--scope` 功能→模块→系统逐层放大）。系统层含边界/IO 对齐 + 真 E2E（tmux + 浏览器，见 real-e2e-testing）。详见 **`references/convergence-scoping.md`**。
- **Stage 6.5 安全合规门（对外 SaaS 必过）**：见 **`references/enterprise-gates.md`** G1–G11（含 G1b DAST）——SAST / DAST / SCA+SBOM / secrets / 覆盖率 / 容器扫 + 审计 / 访问控制 / 加密+KMS / 变更可追溯 / 可靠性 / 数据生命周期；**critical 硬挡（不可豁免）、绝对门 not-run=fail、high 默认挡（named approver 限时放行）**；证据产出 `assets/templates/audit-evidence.md`。**框架保技术控制就绪 + 证据链，"过认证"由组织 + 审计员完成**。
- **Stage 7 Hardening**：终局异构复审 loop（蜂群多视角 + codex + `:security`）→ 连续 N 轮 0 H/M + 安全清零。
- **★人工闸②**：命中 human-gate 3 卡点（金额/DDL/契约）强制停；推送/部署前出对账 + diff + 风险清单等用户拍板。
- **Stage 8 Deliver**：Conventional Commits → commit/PR；部署属生产变更（卡点2），双签后执行。

## 收敛内核（取代旧版 Ralph Loop / 单次 Oracle）

旧版用自研的"编译/测试 + 单个 reviewer"弱验证。**现改为每层调用 `autoresearch-loop`**：多视角蜂群 + codex 异构复审 → 狼群修 → verify（Level 1–4）→ 连续 N 轮 H+M=0 且不回退且无越界才算收敛。这是全网方案（Spec-Kit/MetaGPT/ChatDev）都缺的"跨引擎复审 + 永不假收敛"。接线细节（prose 模式 / subprocess 模式 / `--scope` 映射）见 `references/convergence-scoping.md`。

蜂群 reviewer 用 **default `task` / `general-purpose` agent**（继承会话模型，实证可靠），**不用**被 pin 到不可用模型的专用 reviewer agent（会 404）。视角靠 lens 区分。

## Todo Enforcer（强制完成，声明完成前必查）

1. **Todo 清零**：所有任务标 completed，有未完成不许收尾。
2. **停滞检测**：连续 3 轮 todo 未减 → 停下分析卡点 / 换策略 / 报告。
3. **失败恢复**：单任务连续失败 3 次 → 回滚 → 记录原因 → 换思路。

## 禁止事项

1. 编译通过就说"搞定了"（必须走对应 Level 验证 + 该层 loop 收敛）。
2. 跳过任一层的 loop 收敛 —— 那是假绿。
3. 虚报验证结果（没真启服务就不说"验证通过"）。
4. 越过人工闸①/② 或 human-gate 卡点擅自推进。
5. 半途而废（换策略，连续失败 3 次才上报）。
6. 自己写功能测试（交给 Tester agent）。

## 时间诚实原则

trivial 5–15min / moderate 30–60min / complex 1–3h / 前后端联调 1–2h 起 / **一个真·系统到可部署 = 多轮、可能跨会话**。如实报预估与进度，不用编译成功糊弄。

## 可执行自跑入口（`orchestrator.mjs` —— 开发环免人驱动）

除"agent 驱动"外，本 skill 附一个**可独立运行的确定性驱动** `orchestrator.mjs`：把流水线编码成状态机，用无头 LLM 当 worker，人只在闸/卡点**异步**拍板（不进紧环）。

- 运行：`node orchestrator.mjs "<需求>" [目录]`（跑到下一个未批的闸即停，exit 10）
- 异步审批：`node orchestrator.mjs --approve gate1 <目录>` 后重跑同命令续跑（状态存 `.orch-state.json`，取消/崩溃**零丢失可恢复**）
- 快验实现：`node orchestrator.mjs --impl-only "<需求>" <目录>`（只跑 分解→狼群→集成→测试环）
- 进度：`node orchestrator.mjs --status <目录>`

**worker/引擎（本机已验证）**：默认 **生成 = `codex exec -s workspace-write`（真沙箱：写约束在 cwd,实测拦 `../` 与绝对路径越界写）**；异构复审 = `claude -p`（另一引擎,保异构）；`ORCH_GEN=claude` 可反转。机械/绝对门 = `node --test` + semgrep/secrets/coverage。

**阶段映射**：前半工件 → 闸①（异步批）→ **狼群并行实现**（分解 `modules.json` → `Promise.all` 各 worker 按契约占文件防碰撞 → 集成）→ 测试环收敛 → 企业绝对门 G1-G4（fail-closed）→ **异构复审连续 2 轮 0 H/M**（fail-closed；非单调 churn 下靠"2 连清"防假收敛）→ 闸②（异步批）→ 完成。

**边界（诚实）**：① 免人驱动只作用于**开发环**；闸①/闸②/human-gate 3 卡点**由设计硬停**（异步预批 ≠ 无人，是人不进紧环）。② 质量受 worker/复审模型上限约束，垃圾需求仍需闸①人审方向。③ 成本/时延 = 一条流水线十几~几十次 LLM 调用。④ 规模已实测到"多模块类库"级（狼群 2 模块 0 碰撞、复审真 2 连清收敛）；更大体量未验证。

**信任模型（经 orchestrator 自身异构复审 7H+6M 加固）**：worker 不可信（LLM 生成、可被 prompt 注入）。已封:① **worker 沙箱**——默认 codex 生成走 `-s workspace-write`,**写被约束在 cwd(实测 `../`/绝对路径越界写被拦、无 cwd 外泄漏)**;无 Bash → 无命令执行/shim 劫持/rm;② **lane 强制**——狼群批次前后哈希快照,越界改 in-target 文件即 fail-closed;③ 防假收敛——`VERDICT` 只认末行锚定、测试计数取末次匹配+校验退出码;④ 防逃逸——`modules.json` 路径校验、狼群并发封顶;⑤ 防自批/篡改——`KB_ORCH_TOKEN`(worker 环境已剥离)→ 状态 HMAC 签名 + `--approve` 需 token;⑥ 复审改码后重跑绝对门。**诚实边界**:codex 沙箱在 mac/Linux 用 Seatbelt/Landlock、本机(Windows)实测也拦住了越界写;但若反转成 `ORCH_GEN=claude` 生成,则 claude flags **不约束写**(退回容器天花板)。生产统一建议:codex 沙箱 or 容器 runner。

## Spec-Kit 迁移路线（推荐:站巨人肩膀,只留薄适配)

调研结论(2026):本 skill 的**流水线/loop/异构复审全都是全网成熟方案的复刻**——**GitHub Spec-Kit** 的 `constitution→specify→clarify→plan→tasks→analyze→implement→converge` 几乎与 ultrawork 1:1,官方维护、原生支持 Codex CLI,工件链(data-model/contracts/research/quickstart/checklist)比本 skill 模板更全;loop = evaluator-optimizer / AlphaEvolve / Ralph loop / Kitchen Loop 早有;异构复审 = K-LLM / Cross-Context Review 早有。

**A/B 实测**(同需求):Spec-Kit+codex 与自研 orchestrator 功能都正确;Spec-Kit 工件更全、代码更简洁;自研的 5 模块拆分对小任务反而是过度分解。**结论:日常用 Spec-Kit 底座,不再维护自研全套。**

**只保留两样真差异化(薄适配,贴到 Spec-Kit 上):**
1. `assets/speckit-adapter/constitution.md` —— 把我们的 human-gate 3 卡点 + 实证/收敛口径注入 Spec-Kit 的 `.specify/memory/constitution.md`(领域策略,巨人不懂你的储能/IoT 域)。
2. `speckit-wolfpack.mjs` —— 自研里**唯一有增量**的"狼群并行":读 Spec-Kit `tasks.md`,按**真·文件不相交**分并行批(修正 Spec-Kit 朴素 `[P]` 会把同文件任务标并行→撞车),codex 沙箱 worker 并行 + lane 强制。放在 `$speckit-tasks` 与 `$speckit-implement` 之间可选运行:`node speckit-wolfpack.mjs <project> [feature]`。

自研 `orchestrator.mjs` 留作**学习产物/理解锚点**(懂每层为何存在、边界在哪),不必再当日常入口。

## 资源

- **`references/pipeline-stages.md`** — 9 阶段执行细则与复杂度裁剪
- **`references/clarify-taxonomy.md`** — Stage 1 的 10 类歧义扫描
- **`references/analyze-gate.md`** — Stage 3 的 spec/plan/tasks 一致性门禁
- **`references/convergence-scoping.md`** — loop 作为每层收敛内核的接线与 `--scope` 分层
- **`references/enterprise-gates.md`** — 对外 SaaS + 等保2.0/ISO27001/SOC2 的阻断式门禁（Stage 6.5 的 G1–G11）
- **`assets/templates/`** — constitution / spec / design（边界·IO·主链路·支线·状态机·安全合规） / plan / tasks / **audit-evidence（审计证据）** 工件模板
- **`orchestrator.mjs`** — 可执行自跑入口（确定性驱动 + 无头 claude/codex worker + 狼群并行 + 异步闸审批 + 可恢复状态），开发环免人驱动
- **`speckit-wolfpack.mjs`** — Spec-Kit 加速步骤:安全文件不相交并行执行 tasks(蒸馏自狼群,唯一真增量)
- **`assets/speckit-adapter/constitution.md`** — 贴到 Spec-Kit 的领域薄适配(卡点/收敛口径/红线)
- 引擎与卡点（不属本 skill、原样复用）：`workflows/autoresearch-loop.mjs`、`scripts/autoresearch-loop.sh`、`rules/human-gate.md`、`rules/real-e2e-testing.md`、`rules/routing-core.md`
