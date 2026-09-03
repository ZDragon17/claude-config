---
globs: ["*auth*", "*security*", "*login*", "*password*", "*token*", "*secret*"]
alwaysApply: false
description: "Security best practices"
---

# Security Rules

## 认证 (Authentication)
- 使用成熟的认证库，不要自己实现
- 密码使用 bcrypt/argon2 哈希
- JWT 设置合理的过期时间
- 实现刷新令牌机制
- 记录登录尝试，防止暴力破解

## 授权 (Authorization)
- 实现基于角色的访问控制 (RBAC)
- 每个 API 端点验证权限
- 避免在前端做权限判断
- 最小权限原则

## 输入验证
- 所有用户输入都不可信
- 服务端验证所有输入
- 使用白名单而非黑名单
- 防止 SQL 注入、XSS、CSRF

## 敏感数据
- 不在日志中记录敏感信息
- 使用环境变量存储密钥
- 传输层使用 HTTPS
- 静态数据加密存储

## API 安全
- 实现速率限制
- 使用 CORS 限制来源
- 设置安全响应头
- 禁用不必要的 HTTP 方法
