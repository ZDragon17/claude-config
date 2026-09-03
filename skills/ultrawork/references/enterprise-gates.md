# Enterprise Gates —— 对外 SaaS 的**技术控制子集**门禁（等保2.0三级 / ISO 27001 / SOC2）

> **边界①（证书）**：框架把标准的**技术控制**落成流水线可强制的阻断门 + 审计证据。**"过认证"需组织流程 + 审计员 + 证据归档，框架给不了证书。**
> **边界②（范围，务必读）**：本文件仅覆盖**应用代码层 + CI/CD 流水线可强制的技术控制族（G1–G11）**。以下**不在门禁内、需组织另行落地**：基础设施（物理/网络/主机/入侵防范/恶意代码）、安全管理中心、**等保三级 安全标记 + 强制访问控制**（通常 OS/DB 层承担）、组织/人员/流程类（ISO 组织控制、SOC2 变更审批流程本身）、SOC2 Processing Integrity·Confidentiality·Privacy 全貌。**"G1–G11 全绿" ≠ "等保三级/ISO/SOC2 就绪"，只等于"这批技术控制就绪"。**

## 判停口径（唯一规则，全文件 + analyze-gate + design.md 一致）
- **critical → 不可豁免硬挡**。
- **high → 默认阻断**，仅 `named approver + 理由 + 补救期限` 可**限时**放行（写入 audit-evidence 的豁免表）。
- **medium/low → 记录**，不挡。
- **绝对门 vs 回退门（关键，纠 loop 语义）**：G1–G5、G11 是**绝对阈值门**——`存量` critical 也必须挡，**不得**塞进 autoresearch-loop 只判"回退(green→red)"的 test-cmd 通道（否则基线本就红的仓库会假绿 CONVERGED）。做成**独立 gate 步，非零退出即 fail-closed STOP**。
- 命中 **human-gate 3 卡点（金额/DDL/契约）**：G6 审计 + G9 审批 **升为 critical**。

## 工件层(Stage3 analyze) ↔ 代码层(Stage6.5) 桥接
同一控制两层判据不同、须显式桥接：**工件层缺失（design 没写）默认 HIGH（可放行迭代）；代码层同项缺失（实现没做）升 critical 硬挡（终局不可放行）**。例：审计设计缺 = Stage3 HIGH；审计代码未落 = Stage6.5 critical。

## 控制 → 门禁映射（每条：标准出处 + 工具类 + 阻断级 + 门类型）

| # | 门禁 | 标准出处（精确） | 工具类 | 阻断规则 | 门类型 |
|---|---|---|---|---|---|
| G1 | **SAST** 静态安全扫描 | ISO A.8.28/A.8.29、SOC2 CC7.1、等保 上线前测试 | CodeQL/Semgrep/SpotBugs | critical→硬挡；high→默认挡 | 绝对 |
| G1b | **DAST / 渗透** 动态安全测试 | ISO A.8.29（验收测试）、对外 SaaS 期望 | ZAP/pen-test | critical→硬挡 | 绝对（release 前） |
| G2 | **SCA** 依赖 CVE（直接+传递）+ **SBOM** | ISO A.8.8、SOC2 CC7.1、供应链 | OSV/Trivy + CycloneDX/SPDX | critical CVE→硬挡；SBOM 缺→high | 绝对 |
| G3 | **Secrets 扫描** | ISO A.8.24/A.5.17、SOC2 CC6.1 | gitleaks/trufflehog | 命中真 secret→硬挡 | 绝对 |
| G4 | **测试覆盖率**（内部质量红线，非 SOC2 强制） | 内部质量 | jacoco/nyc | 行/分支 < 阈值(默认 80/70%)→默认挡；关键路径变异 | 绝对 |
| G5 | **容器/IaC 扫描** | SOC2 CC7.1、供应链 | Trivy/Checkov | 镜像 critical / IaC 高危→硬挡 | 绝对 |
| G6 | **审计轨迹** | 等保 8.1.4.3 安全审计、SOC2 CC7.2 | design §8 + 代码 | 覆盖**每用户的安全相关操作**（登录/鉴权/授权变更/数据访问/导出/配置/金额/DDL）；含 时间/用户/类型/成败；**防篡改 + 审计进程防未授权中断(8.1.4.3d) + 留存≥6月**（法源：网安法§21；GB/T22239 要求防篡改+定期备份）。缺→critical | 绝对 |
| G7 | **访问控制** | 等保 8.1.4.2 访问控制、SOC2 CC6.1/6.2/6.3 | design §8 + authz 测试 | RBAC+最小权限+细粒度（用户级主体×表/记录级客体）；**对外 SaaS：tenant/resource/record 级授权 + IDOR/越权测试**；**管理员三权分立(系统/安全/审计管理员分权,8.1.4.2d)**；登录失败锁定+会话超时+口令复杂度(8.1.4.1)；无默认口令/共享账户。缺→critical | 绝对 |
| G8 | **加密 + 密钥管理** | 等保 8.1.4.1d/保密性完整性、ISO A.8.24 | design §8 + 配置 | 传输 TLS；敏感数据存储加密；完整性 MAC/签名；鉴别 ≥ 双因素**且其中一种须密码技术(8.1.4.1d)**；**KMS + 密钥轮换 + 访问分离 + 吊销**。缺→critical | 绝对 |
| G9 | **变更可追溯 + 职责分离** | ISO A.8.32(变更管理)+A.5.3(职责分离)、SOC2 CC8.1 | git + human-gate + CI | **拆两段**（见下）：Stage6.5 前段 + Stage8/闸② 后段 | 混合 |
| G10 | **可靠性**（可观测+回滚+SLO） | SOC2 A1、等保 | design §8 + 部署 | 关键路径无 日志/指标/追踪、无回滚(未验证)、无 SLO→默认挡上线 | 绝对（上线前） |
| G11 | **数据生命周期**（保留/删除/剩余信息/PII） | 等保 8.1.4.6 剩余信息保护 + 8.1.4.11 个人信息保护、ISO A.8.10、SOC2 CC6.5 | design §8 + 代码 | 敏感/PII 数据无 分级→保留期→安全删除/释放前剩余信息清除→PII 删除权/最小化。缺→critical(含 PII 时) | 绝对 |

### G9 拆两段（纠闸位冲突：commit/PR/闸② 发生在 6.5 之后）
- **Stage 6.5 前段**：FR→task→**working diff** 可溯 + 闸① 已批 + 变更计划存在（此时尚无 commit）。
- **Stage 8 / 闸② 后段（收尾封存）**：commit SHA + PR 评审记录 + 闸② 审批 + 部署审批 → 封存 `audit-evidence.md`。
- **证据强度诚实**：git 历史**可作为**变更证据来源**之一**，非"不可篡改"——真不可篡改需 **受保护分支 + signed commit/tag + PR 强制评审 + CI attestation + 远端不可变归档**，这些属组织侧配置。

## 门禁结果 schema（可执行闭环——防"文档摆设"）
每个 G 必须产出一条机器可读结果，写入 `audit-evidence.md`：
```
{ gate: G1, status: pass|fail|waived|not-run, evidence: <报告链接/命令输出>, owner: <人>, waiver: {approver,reason,expiry}|null }
```
- **critical fail → 整体 fail-closed，不得进 Stage 7/交付；不可 waiver**。
- **绝对门 G1–G5/G11：`not-run = fail`**——无扫描/未验证即视为未通过，**不可用 waiver 放行进交付**；绝对门只有"跑了且过"才算 pass。prose 无工具时标 not-run 即**阻断**，须补工具或人工等价扫描转 pass，**绝不当 pass**。
- **仅 high 级 finding 可限时 waiver**（named approver + 理由 + expiry，写入 audit-evidence 豁免表）；critical 与"绝对门 not-run"均**不可** waiver。
- **G6–G11 代码层证据须为工件**（非纯勾选）：G6 审计日志样例 + 防篡改配置；G7 授权矩阵测试 + IDOR/越权测试结果；G8 KMS policy / 轮换证据；G9 PR 评审记录 + CI attestation / signed commit；G10 SLO 定义 + 回滚演练记录；G11 PII 删除 + 剩余信息清除集成测试。

## 审计证据（产出到 audit-evidence.md）
每次发布：G1–G11 的 result schema + 覆盖率/SBOM/扫描报告 + PR 评审 + 闸①② 审批 + commit→FR 追溯 + 豁免表（approver/理由/期限）。这些是 SOC2/ISO 审计员**可采信的证据来源之一**；等保测评另看审计日志留存与防篡改的实机证据。
