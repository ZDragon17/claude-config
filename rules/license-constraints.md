---
alwaysApply: false
description: "许可证合规 — 推荐第三方工具前必须确认许可证类型，禁止推荐 AGPL/SSPL/BSL/商业许可"
---

# License Constraints (许可证约束规则)

## 核心原则

> 开源有风险，选型需谨慎。
> 推荐任何第三方工具/服务前，必须确认许可证合规性。

## 禁止推荐的许可证

以下许可证类型的软件**不得推荐**，除非用户明确要求：

| 许可证 | 典型软件 | 风险说明 |
|--------|---------|---------|
| **AGPL-3.0** | MinIO, MongoDB (旧版), Grafana | 网络使用也需开源，商业使用受限 |
| **SSPL** | MongoDB (新版), Elastic | 提供服务需开源整个技术栈 |
| **BSL** | HashiCorp 产品, CockroachDB | 商业限制，生产环境需付费 |
| **商业许可** | Oracle DB, JIRA | 需要购买授权 |
| **CPAL** | SugarCRM | 强制署名，UI 展示要求 |

## 推荐前必须确认

在推荐任何第三方工具、库、服务之前，**必须**：

1. **确认许可证类型**
   - 优先选择 MIT、Apache 2.0、BSD 等宽松许可证
   - 谨慎使用 LGPL（动态链接通常 OK）
   - 避免 GPL（除非项目本身是 GPL）

2. **检查商业使用限制**
   - 是否允许商业使用
   - 是否有使用量限制
   - 是否需要付费授权

3. **评估替代方案**
   - 存在限制性许可时，主动提供替代方案

## 安全替代方案速查

| 限制性软件 | 推荐替代 | 许可证 |
|-----------|---------|--------|
| MinIO (AGPL) | SeaweedFS, Ceph | Apache 2.0 |
| MongoDB (SSPL) | PostgreSQL + JSONB | PostgreSQL License |
| Elasticsearch (SSPL) | OpenSearch, Meilisearch | Apache 2.0, MIT |
| Redis (新版 RSALv2) | Valkey, KeyDB | BSD |
| Redis (新版 RSALv2) | Dragonfly ⚠️ | BUSL-1.1（2030年转 Apache 2.0，商业环境需评估） |
| Grafana (AGPL) | Apache Superset | Apache 2.0 |

## 推荐话术模板

当用户询问技术选型时，使用以下格式：

```
推荐方案: [软件名]
许可证: [许可证类型]
商业使用: ✅ 允许 / ⚠️ 有限制 / ❌ 需付费
备注: [任何需要注意的事项]
```

## 例外情况

以下情况可以使用限制性许可软件：

1. **用户明确要求** - 用户已知风险并接受
2. **内部工具** - 不对外提供服务
3. **学习/测试** - 非生产环境
4. **已有授权** - 用户已购买商业许可

## 实施要点

1. **主动告知** - 推荐软件时主动说明许可证
2. **提供选择** - 始终提供至少一个宽松许可的替代方案
3. **记录决策** - 重要选型记录在项目文档中
