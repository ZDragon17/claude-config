---
globs: ["*test*", "*spec*", "**/__tests__/**", "**/tests/**"]
description: "Testing best practices"
---

# Testing Rules

## 测试原则
- 测试行为，不测试实现
- 每个测试只验证一件事
- 测试名称描述预期行为
- 遵循 AAA 模式: Arrange-Act-Assert

## 单元测试
- 快速执行 (< 100ms)
- 独立运行，无外部依赖
- Mock 外部服务和数据库
- 覆盖边界条件和异常情况

## 集成测试
- 测试组件间交互
- 使用测试容器 (Testcontainers)
- 清理测试数据
- 验证真实的 API 响应

## 测试覆盖率
- 核心业务逻辑 > 80%
- 关注有意义的覆盖，非数字
- 测试关键路径和边界情况
- 不要为了覆盖率写无意义测试

## 命名规范
- describe: 被测试的单元
- it/test: should + 预期行为
- 示例: `should return 404 when user not found`
