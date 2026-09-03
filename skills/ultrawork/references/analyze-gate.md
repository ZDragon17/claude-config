# Analyze Gate —— spec/design/plan/tasks 一致性门禁（Stage 3）

在写任何代码前，对四份工件（spec.md / design.md / plan.md / tasks.md）做**只读**交叉一致性检查（借鉴 Spec-Kit `/analyze`，并加入设计契约完整性）。这是"工件层"的复审，早于"代码层"的 autoresearch-loop —— 把规格/设计错误挡在实现之前，避免照着错设计造出一致的错。

## 检查维度（每条按 severity：CRITICAL / HIGH / MEDIUM / LOW）

| 维度 | 查什么 | 命中示例 |
|---|---|---|
| 宪法违反 | 是否违反 constitution.md 锁定项 | 选了宪法禁止的技术栈 / 无测试计划 → **CRITICAL** |
| 覆盖缺口 | 每个 spec FR 是否都有 tasks 节点覆盖 | FR-3 没有任何 T-x 覆盖 → **CRITICAL/HIGH** |
| 欠规格 | tasks 节点缺 acceptance / test-cmd / 边界 | T-2 无验收断言 → HIGH |
| 歧义 | 术语/输入输出多解 | spec 未消歧的词进了 tasks → MEDIUM |
| 重复 / 冲突 | 三件工件互相矛盾 | plan 模块划分与 tasks 节点对不上 → HIGH |
| 占位符残留 | TODO / 待定 / 示例值当真值 | tasks 里留 "xxx" → MEDIUM |
| 主链路覆盖 | 每个 spec FR 是否有 design 主逻辑链路（MF） | FR-2 无对应主链路 → **CRITICAL/HIGH** |
| 支线覆盖 | 每条主链路是否按分层清单覆盖支线（请求级/横切/一致性/非功能，见 design.md） | MF-1 只写 happy path → **HIGH**；金额/DDL/契约域 FR 缺关键支线 → **CRITICAL** |
| IO 契约完整 | 每个接口是否有 输入/输出/错误形态 | 某 API 无错误码定义 → HIGH |
| 状态机 | 有生命周期的实体是否有合法流转定义 | 订单无状态机 → HIGH |
| 边界定义 | 系统/模块/信任/外部依赖边界是否明确 | 无信任边界（外部输入进入点）→ HIGH |
| IO 归属 | spec-FR 输入输出 ↔ design §2 IO 契约 是否一一对应不矛盾（design §2 为接口级权威） | 两者字段/错误码冲突 → HIGH |
| 语义正确性 | （**Analyze 不负责**——只查一致/完整，不查"支线写了但写错"） | 由人工闸① + 基于 spec 的 Tester 兜底，非本门禁 |
| 安全合规设计（对外 SaaS） | design §8 是否齐（威胁建模/数据分级/RBAC/加密/审计事件）+ Stage 6.5 门禁可跑 | 缺威胁建模/审计事件 → HIGH；金额/DDL/契约域缺审计或加密 → **CRITICAL**（见 enterprise-gates.md） |

## 怎么跑（复用蜂群，general-purpose agent）
1. 派 3–4 个只读蜂群 agent（`task` / general-purpose），每个读全 spec+design+plan+tasks，从一个维度切入：
   - agent A：宪法违反 + 覆盖缺口（FR↔tasks 映射逐条核）
   - agent B：欠规格 + 占位符（每个 tasks 节点是否可执行/可验收）
   - agent C：歧义 + 重复/冲突（四件工件互指是否自洽）
   - agent D：**设计契约完整性**（每 FR 有主链路、每主链路有支线穷举、每接口有 IO 契约、每生命周期实体有状态机、边界定义齐全）
2. 汇总去重，按 severity 排。
3. **判停**：**CRITICAL 硬挡**（宪法违反 / 覆盖缺口 / human-gate 域 FR 缺主链路或关键支线）→ 回 Stage 1/2 修工件，不许进实现；**HIGH 默认挡**（设计契约完整性缺口：无支线/无 IO 错误码/无状态机/无信任边界——与 design.md 口径一致）——可人工显式放行并记录豁免；MEDIUM/LOW 记录不挡。
   - **工件层 ↔ 代码层桥接**：同一控制（审计/加密/访问）在此（Stage 3 工件层）缺失默认 **HIGH（可放行迭代）**；到 Stage 6.5 代码层同项仍缺 → 升 **critical 硬挡（终局不可放行）**。见 enterprise-gates.md。

## 与代码层 loop 的区别
- **Analyze = 工件层复审**（spec/plan/tasks 文本，只读，无代码）。
- **autoresearch-loop = 代码层收敛**（真跑测试 + 指纹越界 + 异构复审）。
- 两者互补：Analyze 保证"照着**内部一致/完整**的设计造"，loop 保证"造出来的对且安全"。**注意：Analyze 只查一致/完整，不查语义正确**（支线"写了但写错"抓不到）——语义正确由 **人工闸①（逐 MF 支线过目）+ 部分独立于 design（基于 spec 验收/属性测试）的 Tester 用例** 兜底，打破"测试与错设计同源"。
