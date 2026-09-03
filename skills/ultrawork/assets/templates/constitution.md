# 项目宪法（Constitution）—— 不可谈判原则

> 所有阶段（spec / plan / tasks / 实现 / 复审）都必须服从本文件。违反 = analyze 门禁或复审判 CRITICAL，挡下。
> 填好后放项目根 `.specify/constitution.md`（或项目约定位置），作为 pipeline 每阶段的第一约束。
> 本模板复用全局 `~/.claude/rules/`（coding-standards / human-gate / real-e2e-testing），项目只需补项目特有红线。

## 技术栈（锁定，后续不得随意漂移）
- 语言 / 框架：
- 数据库：
- 前端：
- 部署目标：

## 工程红线（不可违反）
- [ ] 每个功能必须有对应功能测试（tdd-workflow / tester agent authored）
- [ ] 编译过 ≠ 完成：改动必须过对应级别验证（Level 1 编译 → 2 测试 → 3 真 E2E → 4 API，见 real-e2e-testing）
- [ ] 最小化精准编辑，禁止全量重写（Edit > Write，改动范围=意图范围）
- [ ] 不吞异常 / 参数化查询 / 不硬编码密钥（全局 coding-standards）
- [ ] 中文注释、自文档化命名、函数单一职责

## 人工卡点（强制停，不可被 pipeline 自动跳过 —— 见 rules/human-gate.md）
- 业务对账：金额 / 统计 / 报表 / 结算 / 计费
- 生产变更：DDL / 批量 DML / 部署脚本 / 生产配置 / secrets / cron
- 跨仓库契约：DTO / VO / OpenAPI / .proto / contracts 目录 / MQTT topic / 厂商 API

## 收敛标准（metric）
- 每层收敛：连续 N 轮 H+M=0 且不回退 且无越界（默认 N=2；由 autoresearch-loop 判定）
- 终局硬门槛：异构复审（蜂群多视角 + codex）0 H/M + 安全项清零 + 真 E2E 通过

## 合规目标（对外 SaaS 适用——决定 Stage 6.5 安全合规门强度，见 references/enterprise-gates.md）
- **目标认证**：等保2.0 三级 / ISO 27001 / SOC2（按实际填）。
- **数据分级**：列出 敏感 / PII / 鉴别数据（决定加密与审计范围）。
- **加密策略**：传输 TLS1.2+；敏感数据存储加密；完整性 MAC / 数字签名；鉴别 ≥ 双因素（含密码技术）。
- **审计留存**：安全审计日志防篡改、留存 ≥ 6 个月（等保三级），含 时间 / 用户 / 事件类型 / 成败。
- **质量红线**：覆盖率 行 ≥ 80% / 分支 ≥ 70%（按项目调）；关键路径变异测试。
- **访问控制**：RBAC + 最小权限 + 细粒度；SSO / MFA；无默认口令 / 共享账户。
- 证据每次发布产出到 `audit-evidence.md`。
