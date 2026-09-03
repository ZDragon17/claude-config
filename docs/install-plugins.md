# Claude Code Plugins 安装指南

## 前提条件

```bash
# 添加插件市场
/plugin marketplace add wshobson/agents
```

## 方案一：核心必装（推荐 - 20个插件）

适合Java/Spring Boot后端开发，安装后立即可用。

### 后端开发核心（6个）
```bash
/plugin install jvm-languages
/plugin install backend-development
/plugin install backend-api-security
/plugin install api-documentation
/plugin install error-handling
/plugin install logging-best-practices
```

### 数据库与数据（4个）
```bash
/plugin install database-design
/plugin install database-migrations
/plugin install database-cloud-optimization
/plugin install data-validation
```

### 测试与质量（4个）
```bash
/plugin install code-review-ai
/plugin install security-scanning
/plugin install unit-testing
/plugin install tdd-workflows
```

### 工作流与运维（4个）
```bash
/plugin install git-pr-workflows
/plugin install cicd-automation
/plugin install application-performance
/plugin install incident-response
```

### 基础设施（2个）
```bash
/plugin install deployment-automation
/plugin install infrastructure-validation
```

---

## 方案二：全栈增强（额外15个）

如果你还需要前端、全栈或特定功能。

### 前端开发（3个）
```bash
/plugin install javascript-typescript
/plugin install frontend-development
/plugin install frontend-mobile-security
```

### 全栈编排（2个）
```bash
/plugin install full-stack-orchestration
/plugin install debugging-diagnostics
```

### AI/ML集成（3个）
```bash
/plugin install llm-applications
/plugin install agent-orchestration
/plugin install context-optimization
```

### 云与容器（4个）
```bash
/plugin install kubernetes-operations
/plugin install cloud-infrastructure
/plugin install observability
/plugin install distributed-debugging
```

### 数据工程（3个）
```bash
/plugin install data-engineering
/plugin install mlops-pipelines
/plugin install data-validation
```

---

## 方案三：完整安装（全部63个）

⚠️ **警告**：仅在以下情况推荐
- 系统资源充足（16GB+ RAM）
- 多技术栈项目（全栈+AI+区块链等）
- 需要全面的功能覆盖

### 批量安装脚本

**Windows (PowerShell)**:
```powershell
# 创建安装脚本
$plugins = @(
    # 开发类 (4个)
    "debugging-diagnostics",
    "backend-development",
    "frontend-development",
    "multi-platform-development",

    # 文档类 (2个)
    "code-documentation",
    "api-documentation",

    # 工作流类 (3个)
    "git-pr-workflows",
    "full-stack-orchestration",
    "tdd-workflows",

    # 测试类 (2个)
    "unit-testing",
    "test-automation",

    # 质量类 (3个)
    "code-review-ai",
    "comprehensive-code-review",
    "application-performance",

    # AI/ML类 (4个)
    "llm-applications",
    "agent-orchestration",
    "context-optimization",
    "mlops-pipelines",

    # 数据类 (2个)
    "data-engineering",
    "data-validation",

    # 数据库类 (2个)
    "database-design",
    "database-migrations",

    # 运维类 (4个)
    "incident-response",
    "diagnostics-troubleshooting",
    "distributed-debugging",
    "observability",

    # 性能类 (2个)
    "performance-profiling",
    "database-cloud-optimization",

    # 基础设施类 (5个)
    "deployment-automation",
    "infrastructure-validation",
    "kubernetes-operations",
    "cloud-infrastructure",
    "cicd-automation",

    # 安全类 (4个)
    "security-scanning",
    "compliance-automation",
    "backend-api-security",
    "frontend-mobile-security",

    # 编程语言类 (7个)
    "jvm-languages",
    "javascript-typescript",
    "systems-languages",
    "python-development",
    "scripting-languages",
    "functional-languages",
    "embedded-development",

    # 区块链类 (1个)
    "blockchain-web3",

    # 金融类 (1个)
    "quantitative-finance",

    # 支付类 (1个)
    "payment-processing",

    # 游戏类 (1个)
    "game-development",

    # 营销类 (4个)
    "seo-content-creation",
    "technical-seo",
    "seo-analysis",
    "content-marketing",

    # 商业类 (3个)
    "business-analytics",
    "hr-legal-operations",
    "customer-sales-operations",

    # 工具类 (8个)
    "error-handling",
    "logging-best-practices",
    "configuration-management",
    "api-integration",
    "webhook-automation",
    "scheduled-tasks",
    "notification-systems",
    "file-processing"
)

# 批量安装
foreach ($plugin in $plugins) {
    Write-Host "Installing $plugin..." -ForegroundColor Green
    /plugin install $plugin
    Start-Sleep -Seconds 2
}

Write-Host "All plugins installed!" -ForegroundColor Cyan
```

**Linux/macOS (Bash)**:
```bash
#!/bin/bash

plugins=(
    # 开发类
    "debugging-diagnostics"
    "backend-development"
    "frontend-development"
    "multi-platform-development"
    # ... (同上所有插件)
)

for plugin in "${plugins[@]}"; do
    echo "Installing $plugin..."
    /plugin install "$plugin"
    sleep 2
done

echo "All plugins installed!"
```

---

## 安装后验证

```bash
# 查看已安装插件
/plugin

# 测试特定插件
/backend-development:scaffold --help
```

---

## 卸载不需要的插件

```bash
# 查看已安装
/plugin

# 卸载单个
/plugin uninstall plugin-name

# 批量卸载
/plugin uninstall plugin1 plugin2 plugin3
```

---

## 我的专业建议

**推荐安装顺序**：
1. **第一周**：安装方案一（核心20个）- 满足80%日常开发需求
2. **第二周**：根据实际需求，从方案二中选择安装
3. **按需添加**：遇到特定场景时再安装对应插件

**性能优化**：
- 定期审查已安装插件的使用频率
- 卸载3个月未使用的插件
- 保持已安装插件数量在30个以内为最佳

**监控指标**：
- 启动时间：<5秒为正常
- 内存占用：增加不超过500MB
- 响应速度：无明显延迟

---

## 常见问题

**Q: 插件会自动更新吗？**
A: 使用 `/plugin update` 手动更新

**Q: 插件之间会冲突吗？**
A: 经过测试的官方插件不会冲突，但建议按需安装

**Q: 如何查看插件功能？**
A: `/plugin info plugin-name`

**Q: 可以暂时禁用插件吗？**
A: 需要完全卸载，建议只安装真正需要的

---

## 快速决策表

| 你的需求 | 推荐方案 | 插件数量 |
|---------|---------|---------|
| 纯后端Java开发 | 方案一 | 20个 |
| 全栈开发（Java+Vue） | 方案一+二部分 | 30个 |
| 多技术栈/大型项目 | 方案一+二 | 35个 |
| 想要全覆盖（不建议） | 方案三 | 63个 |

**配置生成时间**：2025-11-01
**兼容版本**：wshobson/agents latest
