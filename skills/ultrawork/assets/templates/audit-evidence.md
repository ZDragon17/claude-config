# 审计证据（Audit Evidence）—— SOC2 / ISO 27001 / 等保测评 **可采信的证据来源之一**

> 每次发布产出。**框架产出证据，认证由组织 + 审计员完成**。
> 变更证据强度诚实：git 历史是变更来源**之一**，**非"不可篡改"**——真不可篡改需 受保护分支 + signed commit/tag + PR 强制评审 + CI attestation + 远端不可变归档（组织侧配置）。

## 本次发布
- 版本 / working diff：
- 需求追溯：FR ↔ tasks ↔ working diff（Stage 6.5 前段）→ commit SHA（Stage 8 后段封存）

## 门禁结果（G1–G11，机器可读 schema）
> **critical fail 或 未授权 high fail = 整体 fail-closed，不得进 Stage 7 / 交付**。`not-run ≠ pass`——无扫描工具只能标 not-run + named approver waiver（记补救期限）。

| Gate | status（pass/fail/waived/not-run） | evidence（报告链接/命令输出） | owner | waiver（approver / 理由 / expiry） |
|---|---|---|---|---|
| G1 SAST | | | | |
| G1b DAST/渗透 | | | | |
| G2 SCA + SBOM | | | | |
| G3 Secrets | | | | |
| G4 覆盖率 | | 行 % / 分支 % | | |
| G5 容器/IaC | | | | |
| G6 审计轨迹 | | | | |
| G7 访问控制 | | | | |
| G8 加密+密钥 | | | | |
| G9 变更+职责分离（G9a pre-commit / G9b post-commit，见下） | | | | |
| G10 可靠性 | | | | |
| G11 数据生命周期 | | | | |

## 变更管理与审批（G9 —— SOC2 CC8.1 / ISO A.8.32 变更管理 + A.5.3 职责分离）
- Stage 6.5 前段：闸① 批准（谁 / 何时）+ 变更计划
- Stage 8 / 闸② 后段：commit SHA + PR 评审人 + 闸② 审批 + 部署审批（**职责分离：开发 ≠ 审批 ≠ 部署**）

## 合规控制实机核对（等保三级 / ISO / SOC2）
- [ ] 审计：覆盖每用户安全操作，含 时间/用户/类型/成败，防篡改 + 审计进程防未授权中断，留存 ≥ 6 月
- [ ] 访问：RBAC + 最小权限 + 细粒度 + 租户/记录级授权 + IDOR 测试；管理员三权分立；登录锁定/会话超时/口令复杂度
- [ ] 加密：传输 TLS + 存储加密 + 完整性 MAC/签名；鉴别 ≥ 双因素（含密码技术）；KMS + 轮换 + 吊销
- [ ] 数据生命周期：分级 / 保留 / 安全删除 / 剩余信息清除 / PII 删除权
- [ ] 可靠性：日志/指标/追踪 + 回滚（已验证）+ SLO
