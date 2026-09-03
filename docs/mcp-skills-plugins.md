# MCP服务器 + Skills + Plugins 完整配置

## MCP服务器配置（14个）

### 已安装（7个）

| MCP | 功能 | 自动激活 |
|-----|------|---------|
| **Playwright** | 浏览器自动化、E2E测试 | ✅ 是 |
| **Chrome DevTools** | Chrome调试、性能分析 | ✅ 是 |
| **IDE** | IDE集成功能 | ✅ 是 |
| **context7** | 实时库文档查询 | ✅ 是 |
| **spec-workflow** | 规范工作流管理 | ✅ 是 |
| **open-websearch** | 免费网页搜索 | ✅ 是 |
| **mcp-deepwiki** | AI代码库分析 | ✅ 是 |

### 推荐安装（7个）

```bash
# 文件系统操作
npx -y @modelcontextprotocol/server-filesystem /path/to/project

# Git版本控制
npx -y @modelcontextprotocol/server-git --repository /path/to/repo

# 持久化记忆
npx -y @modelcontextprotocol/server-memory

# Web内容抓取
npx -y @modelcontextprotocol/server-fetch

# SQLite数据库
npx -y @modelcontextprotocol/server-sqlite --db-path /path/to/db

# PostgreSQL数据库
npx -y @modelcontextprotocol/server-postgres postgresql://localhost/dbname

# Chrome调试
npx -y @patruff/chrome-devtools-mcp
```

### MCP配置文件位置

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:\\projects"]
    },
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/dbname"]
    }
  }
}
```

---

## Agent Skills（17个）

**完全自动触发，无需手动调用**

### 核心开发Skills（5个）

| Skill | 触发关键词 | 专长 |
|-------|-----------|------|
| **java-architect** | Java、架构、微服务、高并发 | Java企业级架构设计 |
| **spring-boot-expert** | Spring Boot、REST API、Controller | Spring Boot最佳实践 |
| **api-designer** | API设计、RESTful、OpenAPI | API设计与文档 |
| **database-optimizer** | SQL优化、慢查询、索引 | 数据库性能优化 |
| **mqtt-protocol-expert** | MQTT、IoT、BMS | MQTT协议专家 |

### 代码质量Skills（4个）

| Skill | 触发关键词 | 专长 |
|-------|-----------|------|
| **clean-code-expert** | 代码整洁、重构、代码规范 | Clean Code原则 |
| **design-patterns-expert** | 设计模式、GoF、单例 | 23种设计模式 |
| **security-best-practices** | 安全、OWASP、SQL注入 | 安全最佳实践 |
| **test-expert** | 测试、TDD、单元测试 | 测试驱动开发 |

### 性能与架构Skills（3个）

| Skill | 触发关键词 | 专长 |
|-------|-----------|------|
| **performance-optimization** | 性能优化、调优、瓶颈 | 性能分析调优 |
| **system-design-architect** | 系统设计、分布式、高可用 | 系统架构设计 |
| **algorithms-data-structures** | 算法、数据结构、LeetCode | 算法与数据结构 |

### 自动触发示例

```
你："优化这个SQL查询"
→ 自动激活：database-optimizer

你："设计微服务架构"
→ 自动激活：java-architect + system-design-architect

你："审查代码安全性"
→ 自动激活：security-best-practices + clean-code-expert
```

---

## Claude Code Plugins（18个已安装）

### 核心插件（13个）

```bash
# 后端开发
jvm-languages              # Java专家 + Scala/C#
backend-development        # 后端架构 + GraphQL + TDD
backend-api-security       # API安全 + 认证

# 数据库
database-design            # 数据库架构师 + SQL专家
database-migrations        # 数据库迁移 + 可观测性
database-cloud-optimization # 云优化 + 成本优化

# 质量保证
code-review-ai             # AI代码审查
security-scanning          # SAST安全扫描
unit-testing               # 单元测试 + 调试
tdd-workflows              # TDD工作流

# CI/CD
git-pr-workflows           # Git工作流
cicd-automation            # CI/CD自动化
application-performance    # 应用性能监控
```

### 可选插件（5个）

```bash
full-stack-orchestration   # 全栈编排
data-engineering           # 数据工程
javascript-typescript      # JS/TS专家
kubernetes-operations      # K8s运维
cloud-infrastructure       # 云基础设施
```

### 使用示例

```bash
# 完整开发流程
/full-stack-orchestration:full-stack-feature "用户认证系统"

# 安全扫描
/security-scanning:security-sast --comprehensive

# 数据库迁移
/database-migrations:sql-migrations --zero-downtime

# 代码审查
/code-review-ai:comprehensive-review --multi-agent
```

### 插件管理

```bash
# 查看已安装
/plugin

# 安装新插件
/plugin install <plugin-name>

# 卸载插件
/plugin uninstall <plugin-name>
```

---

## 配置优先级

**加载顺序**：
```
1. 全局配置（CLAUDE.md或CLAUDE-LITE.md）
2. MCP服务器（自动可用）
3. Agent Skills（智能触发）
4. Plugins（需安装，部分需手动调用）
```

**自动化程度**：
- ✅ **MCP**: 100%自动（配置即可用）
- ✅ **Skills**: 95%自动（智能触发）
- ⚠️ **Plugins**: 70%自动（部分需手动调用）
