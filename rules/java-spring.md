---
globs: ["*.java", "**/src/main/java/**", "**/src/test/java/**"]
description: "Java/Spring Boot best practices"
---

# Java/Spring Rules

## 命名规范
- 类名: PascalCase (UserService)
- 方法/变量: camelCase (getUserById)
- 常量: UPPER_SNAKE_CASE (MAX_RETRY_COUNT)
- 包名: 全小写 (com.example.service)

## Spring Boot
- 使用构造器注入而非 @Autowired
- Controller 只做请求处理，业务逻辑放 Service
- 使用 @Transactional 管理事务
- 配置使用 @ConfigurationProperties

## 层次结构
- Controller → Service → Repository
- DTO 用于 API 传输，Entity 用于持久化
- 使用 MapStruct 做对象映射
- 异常统一在 @ControllerAdvice 处理

## MyBatis
- SQL 写在 XML 文件中
- 使用 #{} 防止 SQL 注入
- 复杂查询使用动态 SQL
- 分页使用 PageHelper

## 测试
- 单元测试覆盖 Service 层
- 使用 @SpringBootTest 做集成测试
- Mock 外部依赖
- 测试类以 Test 结尾
