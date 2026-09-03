---
globs: ["*.sql", "**/migrations/**", "**/db/**"]
description: "SQL best practices and patterns"
---

# SQL Rules

## 命名规范
- 表名: snake_case 复数 (users, order_items)
- 列名: snake_case (created_at, user_id)
- 索引: idx_表名_列名 (idx_users_email)
- 主键: id 或 表名_id

## 查询优化
- 只选择需要的列，避免 SELECT *
- 使用 EXPLAIN 分析执行计划
- 为 WHERE/JOIN 列创建索引
- 避免在 WHERE 中使用函数
- 大表使用分页查询

## 设计原则
- 每表必须有主键
- 使用外键保证数据完整性
- 合理使用 NOT NULL 约束
- 考虑使用软删除 (deleted_at)
- 添加 created_at, updated_at 时间戳

## 安全
- 使用参数化查询防止 SQL 注入
- 最小权限原则
- 敏感数据加密存储
- 审计日志记录变更
