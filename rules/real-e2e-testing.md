---
alwaysApply: true
description: "真实联调验证 — 编译过≠功能可用，必须启动前后端+Playwright MCP 真实浏览器验证"
---

# 真实启动联调验证，不能只跑编译

前后端联调必须真实启动服务并在浏览器中验证，编译通过 ≠ 功能可用。这是持续 1-2 小时的大任务，不是 10 分钟能搞定的。

# 编译通过 ≠ 功能可用

以下不算验证通过：
- `mvn clean compile` 成功 ❌
- `mvn test` 单元测试通过 ❌
- `npm run build` 前端构建成功 ❌
- 代码 review 看起来没问题 ❌

以下才算验证通过：
- 后端服务真实启动，健康检查通过 ✅
- 前端 dev server 启动，页面能打开 ✅
- 关键 API 接口实际调通（Playwright MCP / curl）✅
- 页面功能走通 golden path + 边界场景 ✅
- 前端控制台无报错 ✅

# 完整联调验证流程

```
1. 启动后端（tmux 中跑 java -jar 或 mvn spring-boot:run）
   └─ 等待启动完成，检查健康端点

2. 启动前端（tmux 中跑 npm run dev）
   └─ 等待 dev server ready

3. 用 Playwright MCP 验证功能
   └─ golden path：主流程走通
   └─ 边界场景：空数据、异常输入、网络异常
   └─ 控制台无 JS 错误
   └─ API 响应正确（状态码 + 数据结构）

4. 发现问题 → 定位前端还是后端 → 修复 → 重新验证
   └─ 前端问题修前端
   └─ 后端问题修后端
   └─ API 契约不匹配两边都要改

5. 全部验证通过 → 才能说"测试通过"
```

# 时间预期

- 前后端联调是 **1-2 小时的大任务**，不是 10 分钟能搞完的
- 如果 10 分钟就说"搞定了"，大概率是偷懒只跑了编译
- 宁可多花时间真正验证，也不要虚报完成让用户踩坑

# Loop 在联调中的作用

联调期间应自动启动 loop：
- 监控后端日志（ERROR/WARN）
- 监控前端控制台（JS 报错）
- API 调用失败自动抓取请求/响应详情
- 发现问题主动修复，不等用户来问

# 工具链

- **tmux**：后端和前端分别在不同 pane 中运行，方便看日志
- **Playwright MCP**（浏览器自动化）：
  - `browser_navigate` / `browser_click` / `browser_type` / `browser_fill_form`：操作页面
  - `browser_snapshot`：检查 DOM 结构
  - `browser_take_screenshot`：截图验证视觉效果
  - `browser_console_messages`：检查 JS 报错
  - `browser_network_requests` / `browser_network_request`：检查 API 调用状态码和响应体
- **curl**：快速验证后端 API 响应（不经过前端时）
- **Loop**：持续监控后端日志和前端控制台错误

# Why

用户多次遇到"你说测试通过了但功能根本跑不通"的情况，每次都得用户自己发现问题再回来要求修复。作为智能体，应该自主完成完整的验证闭环，而不是用编译成功来糊弄交差。

# How to apply

涉及前后端联调的任务，必须走完整验证流程。预估时间如实告知（1-2 小时），过程中通过 loop 持续监控，发现问题自主修复。只有真正在浏览器中走通了才能报告完成。
