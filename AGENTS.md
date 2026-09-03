# AGENTS.md — 个人 Agent 操作系统（通用层）

> 本文件是**跨 agent 通用**的常驻规则权威源（单一信源）。
> Claude Code 经根目录 `CLAUDE.md` 桥接加载；Codex / Gemini CLI / opencode 等直接或经桥接文件读取。
> 详细手册在 `rules/`（按需 Read，不常驻占上下文），私有技能在 `skills/`。

---

## 用户与技术栈（档案详见 rules/user-profile.md）

- **后端**：Java + Spring Boot 模块化单体（深度）、数据库性能调优（执行计划 / 覆盖索引 / 慢查询）
- **IoT**：MQTT、Modbus RTU/TCP、RS485（深度），手写过设备协议解析器
- **前端**：Vue 3 + Element Plus（熟练）、React/TypeScript
- **数据**：MySQL/PostgreSQL + Redis；工程化：容器编排、时序库、消息中间件
- **语言**：中文回复。解释深度适配读者：熟领域直接给结论，生领域先补背景。

## 三道人工卡点（任何自动化不可越过）

1. **业务对账**：金额 / 计费 / 对账 / 结算逻辑，改动前必须交人确认
2. **生产变更**：DDL、迁移脚本、推送 / 部署、批量 DML——先给影响范围 + 回滚方案
3. **跨仓库契约**：接口签名、事件 payload、DB schema、proto/OpenAPI 变更须协商

## 铁律

- **最小改动**：只改与任务相关的行，不顺手重构、不改无关格式
- **编译过 ≠ 完成**：真启动、真调用、真验证才叫验证过；没跑过不许说"验证通过"
- **不虚报**：测试失败就说失败，跳过的验证要明说
- **危险命令**（DROP / TRUNCATE / 无 WHERE 的 UPDATE·DELETE / 递归 rm）必须先停

## 工具优先级

结构化工具 > shell 替代品（Grep > bash grep；Read/Write/Edit > cat/echo）；探索型搜索委派给子任务。

## 质量标准

KISS + DRY + YAGNI + SOLID；清晰命名、职责单一；中文注释解释"为什么"。

## 模式控制（用户口令实时切换）

| 模式 | 触发词 | 行为 |
|---|---|---|
| 快速 | "快速模式" | 零干扰：不规划、不审查建议、不测试建议；保留危险操作确认 |
| 标准（默认） | "标准模式" | 平衡：≥5 步建议规划；核心逻辑建议审查 / 测试 |
| 严格 | "严格模式" | 质量优先：≥3 步强制规划，逻辑变更必须审查 + 测试 |

## 项目级覆盖

项目根目录 `config.json` 可覆盖全局（mode / rules / customRules）。优先级：项目 > 全局 > 模式默认。

---

## 常驻规则源文件（支持的 agent 请在会话启动时加载）

| 文件 | 内容 |
|---|---|
| `rules/always-apply.md` | 全局编码标准 |
| `rules/routing-core.md` | 意图路由与并行机制 |
| `rules/human-gate.md` | 人工卡点细则 |
| `rules/user-profile.md` | 用户档案（能力域 / 判断取向 / 协作偏好） |
| `rules/autonomous-judgment.md` | 自主判断边界 |
| `rules/real-e2e-testing.md` | 实证验证标准 |
| `rules/minimal-edit.md` | 最小改动纪律 |

> 其余 `rules/` 为按需手册：workflow-routing / autoresearch-loop-execution / 各语言与领域规范（java-spring、vue、typescript、sql、mqtt-iot、modbus-protocol、docker-k8s…）/ 工程经验（real-e2e-testing、db-perf-cover-index、git-secret-scrub…）。
