---
alwaysApply: true
description: "人工卡点 3 道安全闸 — 业务对账/DDL/跨仓库契约改动时强制停下等人，高于自动编排"
---

# 人工卡点规则（业务对账 / 生产变更 / 跨仓库契约）

AI 自动执行的 3 道安全闸 — 涉及业务正确性、生产数据、跨仓库契约时强制停下来等人，不擅自推进。

# 3 道强制人工卡点

工作流路由总入口（workflow-routing.md）虽然能闭环 80% 开发执行，但以下 3 类改动**必须**触发人工卡点，不允许 autoresearch / 狼群 / ultrawork 擅自推进。

## 卡点 1：业务对账（涉及金额 / 统计 / 报告）

**触发条件**：改动涉及任一关键词
- 金额 / balance / payment / 收益 / 计费 / 结算
- 统计 / 汇总 / SUM / COUNT / 报表 / 报告
- 数据口径 / 时间窗 / 时区 / 周期

**强制流程（三段验证）**：
```
1. 伪造数据本地跑通（测试绿是必要条件，不是充分条件）
2. 测试环境跑真实数据，输出"AI 计算结果 vs 旧系统/Excel" 差异表
3. 业务方逐项签字接受 → 才允许合并
```

**Why**：测试 PASS 不代表业务正确 — 报告类项目常见情形：单元测试 45/0/1 通过，但对照生产数据 PDF 还能挖出几十项口径差异。**测试绿 ≠ 业务对**。

## 卡点 2：生产变更（DDL / 批量数据 / 部署脚本）

**触发条件**：改动涉及
- DDL（CREATE / ALTER / DROP TABLE / INDEX / 字段变更）
- 批量 DML（UPDATE / DELETE WHERE 命中 > 100 行 / migration 脚本）
- 部署脚本（docker-compose / Dockerfile / CI/CD pipeline）
- 配置变更（生产 application.yml / secrets / cron / 定时任务）

**强制流程**：
```
1. 不在生产跑 autoresearch（不可回滚 → 不能迭代）
2. AskUserQuestion 列出影响范围（哪些表、多少行、是否锁表、回滚方案）
3. 走项目的 migration / rollout 流程（按项目实际路径）
4. DBA / 运维双签后才执行
```

**Why**：autoresearch 的"改→量→留/弃"模型在生产数据上失效 — 删了数据没法 undo。必须人审 SQL + 留回滚脚本。

## 卡点 3：跨仓库契约（后端 ↔ 前端 / 厂商 API）

**触发条件**：改动涉及
- Controller / DTO / VO 字段 — 前端会用
- OpenAPI / 契约文件
- 厂商对接接口（第三方 API）
- MQTT topic 命名 / payload 结构 / 消息格式

**强制流程**：
```
1. 改动后自动产 OpenAPI diff（对比主分支）
2. 列出受影响的字段：新增 / 删除 / 重命名 / 类型变更
3. 输出"前端/对端需要同步改动"清单
4. 提示用户："这些改动需要前端/厂商同步，是否暂缓合并？"
```

**Why**：跨仓库改动错位会导致线上 4xx/5xx。后端单方面合并不安全。

# 触发优先级

这 3 道卡点**高于** workflow-routing.md 中的任何自动编排：

| 场景 | 行为 |
| --- | --- |
| 用户说"循环狼群修财务计算直到测试绿" | 修完测试绿后**不自动合并**，触发卡点 1，等业务签字 |
| 用户说"做完它"涉及 DDL | ultrawork 跑到 DDL 步骤**停下**，触发卡点 2 |
| 用户说"派狼改 DTO 字段" | 改完**自动产 diff**，触发卡点 3，提示前端同步 |

# How to apply

1. 收到指令先扫**卡点触发关键词**（金额/统计/DDL/批量 DML/DTO/openapi 等）
2. 命中任一卡点 → 在编排手册基础上**插入人工卡点节点**
3. 卡点节点不允许 autoresearch 自动跳过 — 必须 AskUserQuestion 或显式输出对账表/diff
4. 用户明确说"我已知风险，跳过卡点" → 才放行，但要在 commit message 记录

## 自动闸的实现（autoresearch-loop mjs/sh 的 isGated）

两个循环脚本把上述词表编码成 `isGated` 正则，命中即整 loop STOP 交人工。**设计要点（改动前必读，防回归）**：
- **强信号全文匹配**：DDL/ALTER TABLE/批量 DML(大写 UPDATE/DELETE...WHERE)/SQL 上下文的 SUM·COUNT/金额·统计·结算·报表 等 → title+detail+file 全文命中。SQL 关键字大写敏感（散文小写 update...where 不误触发）；聚合须 SELECT 上下文（不命中 `items.count()`）。
- **领域标识符 camelCase 友好但防子串误命中**：payment/settlement/invoice/ledger/DTO/VO 用「词边界 | 大写驼峰 | 词首接大写」三分支，命中 `PaymentService`/`UserDTO` 却放过 `INVOKE`/`SERVOMOTOR`/`load balancer`（否则储能/IoT 域高频误 gate）。
- **balance 双义精确化（储能域关键）**：`balance` 在储能/BMS 域多指电芯/负载均衡（`cellBalance`/`loadBalancer`/`rebalance`），非金额。故 balance **不进通用标识符**，单独走 `GATE_BALANCE` 白名单——只命中限定财务形（`accountBalance`/`walletBalance`/`balanceSheet`/`balanceDue`/中文`余额`/`结余`），放过所有均衡类术语。真财务 balance 场景通常与 `金额/结算/payment` 共现、仍被强信号 gate。
- **contract/契约 只判文件路径、不判 detail 全文**：`architect-reviewer` 视角的正常 finding 常含"契约/SOLID contract/职责单一"术语，若全文匹配会每轮误触发假卡点 STOP、自动化跑不起来。**切勿**把 contract 改回全文匹配。且 contract 锚到**路径/文件名分隔符边界**（`(^|[/._-])contracts?(?=[/._-]|$)`，中文 `契约` 同）而非裸子串——基线卡点(gatebaseline)对整个改动集施加 `GATE_CONTRACT_PATH`：裸 `contract` 会让 `*Contract*.java`（储能/合同域高频类名）每轮误 STOP（Rev2-M2），但仅锚 `/` 又会漏 `api/contract.yaml`/`user-contract.json`（codex-final-M1，fail-open 漏卡点）；现命中 `contracts/` 目录 + `contract.yaml`/`user-contract.json` 工件 + `.proto`/`openapi`/`swagger`，放过 `ContractService.java`/`EnergyContract.java`。
- **口语词移出正则**：`报告/时区/周期/时间窗/数据口径` 等口语高频词不进 `isGated`（会每轮误触发），仅保留在本文件词表供人工判断时参考。
- 三处单一语义须同步：`workflows/autoresearch-loop.mjs`、`scripts/autoresearch-loop.sh` 内嵌 lib.js、本文件词表。改一处必改三处。

**平台侧已同向加固（2026-07 CC 2.1.198/2.1.205）**：subagent 发给父级的消息**永远不被当作用户批准**（2.1.198）；后台任务完成通知**显式声明「无人工输入发生」**，杜绝 agent 在 transcript 里伪造审批被误当真执行（2.1.205）。即卡点"人来拍板"的原则现在**运行时层面也兜底**——脚本 `isGated` STOP 与平台防伪造审批形成双保险，agent 无论如何都无法自造一个"人已批准"绕过卡点。

# Why（顶层）

AI 工具栈已经覆盖开发执行的 80%，剩下 20% 是"AI 不该擅自决定"的领域：业务正确性、生产数据安全、跨系统契约。这 3 道卡点把 AI 锁在该锁的边界内，让人来做该人做的判断。

工具的极限不是"无死角全自动"，而是"在能自动的地方自动，在该停的地方停"。
