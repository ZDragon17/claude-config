---
alwaysApply: false
description: "数据库性能 — 区域/租户维度 SUM 接口超时优先加覆盖索引，不是先上物化表"
---

# 数据库性能：全表 SUM 超时先加覆盖索引

区域/租户维度的全表 SUM 接口超时，诊断和修复优先级 — 优先加覆盖索引，不要先上物化表或缓存击穿防护。

# 诊断和修复优先级

1. **先 `EXPLAIN ANALYZE`** 看是不是「Index lookup on 单列索引 + 海量回表」模式
2. 若是，**优先加覆盖索引** `(filter_column, sum_column)`，而不是先上物化表 / 缓存击穿防护 / 异步刷新
3. 配合现有 Redis 缓存基本就能压住，写入侧 5-15% 慢化通常可接受

# 实战案例

`SELECT SUM(income) FROM xxx WHERE region_code=?` 接口偶发超时：

- 现状：`region_code` 单列索引，区域内 270 万行
- 表现：单次 `SUM(income)` 耗时 110 秒（120s socketTimeout 边缘）
- 已做但无效：Redis 5min 缓存 + socketTimeout 提到 120s（根因是缓存 miss 那一刻 SUM 单次就要 110s）
- 解：加 `(region_code, income)` + `(region_code, feed_in_energy)` 覆盖索引 → 压到秒级

# How to apply

- 遇到任何「区域/租户级聚合接口偶发超时」先看 `EXPLAIN ANALYZE` 的 actual time 和 rows
- 如果 actual time 在秒级以上，且执行计划显示 `Index lookup` 命中了**非覆盖索引**，第一反应是加覆盖索引，不要先想物化表
- 物化预聚合表（如 `xxx_region_daily_summary`）是数据量到千万级、覆盖索引也压不住时的下一步方案
- SQL 内 SUM 替换 Java 内 SUM、多查询并行化、缓存预热 job 这些是次要补丁，索引没建之前做这些都是隔靴搔痒
- 写入热表加索引前要估算：索引体积、写入慢化幅度、ONLINE DDL 期间 IO 抖动窗口

# 相关

性能问题必须真实诊断数据后再拍板（见 real-e2e-testing.md）。
