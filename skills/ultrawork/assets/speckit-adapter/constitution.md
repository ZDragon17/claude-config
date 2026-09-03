# Project Constitution（薄适配层:把"我们独有的差异化"贴到 Spec-Kit 底座上）

## Core Principles

### I. 实证主义（NON-NEGOTIABLE）
编译过 ≠ 完成。任何"完成"声明必须有真实证据:真跑测试绿、真启动验证功能。禁止用"看起来对/编译通过"糊弄。看 git diff / 真实结果,不看自报。

### II. Test-First
每个功能必有测试;实现前测试先行,测试须真实覆盖边界(空/边界/错误路径),不得删测试凑绿。

### III. 收敛口径:连续 2 轮 0 H/M
"够好了"的判据是硬的:异构复审(生成引擎之外的另一引擎)**连续 2 轮 0 High/0 Medium** 才算收敛;单轮干净是运气不是收敛。绝对门(SAST/secrets/覆盖率)fail-closed。

### IV. 最小化精准编辑
改已有代码用最小 diff,禁止全量删除重写;diff 范围 = 意图范围。

### V. 中文交付
解释/注释/文档全中文;仅代码标识符与技术术语保留英文。

## Additional Constraints（领域约束）
- 技术栈默认:Node ESM + node:test（除非需求另指定）。
- 安全:不硬编码密钥;参数化查询;输入校验;不吞异常。

## Quality Gates & Human Gates（人工卡点——本层的真正差异化)
**3 道人工卡点,命中必停等人,不可自动跨越:**
1. **业务对账**:改动含 金额/balance/payment/结算/统计/汇总/报表 → 测试绿 ≠ 业务对,须人工核对账目差异表后放行。
2. **生产变更**:DDL(ALTER/DROP/CREATE TABLE/INDEX)、批量 DML(>100 行)、migration、部署脚本、生产配置 → 不在生产跑自动迭代,须列影响范围 + 回滚方案 + DBA/运维双签。
3. **跨仓库契约**:Controller/DTO/VO 字段、OpenAPI、厂商 API、MQTT topic/payload → 产 diff,列受影响字段,提示对端同步,暂缓合并。
- 架构确认(闸①):spec/design/plan/tasks 定稿后交人审,逐条过支线/风险,人说"可以"才写码。
- 推送/部署(闸②):须人工放行,不自动 ship。

## Governance
本宪法高于一切自动编排。任一自动流程(生成/复审/收敛)命中上述卡点必须停机等人。
补充说明:此文件是"贴在 GitHub Spec-Kit 底座上的领域薄适配",Spec-Kit 提供 constitution→specify→clarify→plan→tasks→analyze→implement→converge 引擎,本文件只补"我们独有"的卡点/口径/红线。

**Version**: 1.0.0（薄适配） | **Ratified**: 2026-07-11 | **Last Amended**: 2026-07-11
