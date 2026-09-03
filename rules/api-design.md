---
globs: ["*controller*", "*api*", "*route*", "*endpoint*", "openapi*", "swagger*"]
description: "RESTful API design best practices"
---

# API Design Rules

## RESTful 规范
- 使用名词复数: /users, /orders
- HTTP 方法: GET/POST/PUT/PATCH/DELETE
- 使用正确的状态码
- 版本化: /api/v1/users

## 状态码
- 200: 成功
- 201: 创建成功
- 204: 删除成功（无内容）
- 400: 请求错误
- 401: 未认证
- 403: 无权限
- 404: 资源不存在
- 422: 验证失败
- 500: 服务器错误

## 请求/响应
- 使用 JSON 格式
- 驼峰命名 (camelCase)
- 分页使用 page/size 或 cursor
- 统一错误响应格式

## 文档
- 使用 OpenAPI/Swagger
- 每个端点有描述和示例
- 记录所有可能的响应
- 保持文档与代码同步

## 安全
- 使用 HTTPS
- 实现认证和授权
- 速率限制
- 输入验证
