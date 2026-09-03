# Claude Code 全局配置仓库 · Loop Engineering 工程实践

作者的 Claude Code 全局工作环境，**本仓库 = `~/.claude/` 目录**（已排除缓存/历史/会话记录）。

它不只是"一堆 rules + skills 的备份"，而是一套 **Loop Engineering（循环工程）** 方法论的工程落地：
把"**改 → 量 → 留/弃，自收敛到可量化目标**"从「模型自觉」升级为「脚本强制」——可量化 metric、
双硬闸（轮数 + 预算）、防假收敛、人工卡点、确定性安全闸，一应俱全。详见 [⭐ Loop Engineering 工程实践](#-loop-engineering-工程实践)。

> ⚠️ **私有仓库（PRIVATE）**：含工作习惯、项目结构、agent 偏好等敏感信息，仅供个人跨电脑同步，请勿对外公开。

> 🚀 **最快路径**：新电脑 clone 后跑 `node scripts/bootstrap.mjs` 一键还原（改路径 + 装插件 + 配 MCP + 装 skill 依赖），再 `claude login` 即可。下面 §2–§4 是等价的手动分步，仅排查时需要。

---

## ⭐ Loop Engineering 工程实践

> **核心命题**：AI 循环工作流最隐蔽的失败不是"改坏"，而是"**在该停的地方不停 / 在该收敛时假收敛**"。
> Loop Engineering 就是把"自收敛迭代"做成**可证明、不可糊弄、不可绕过**的工程，而非靠模型自觉。

### 三层实现（同源、各自最优场景）

| 层 | 落点 | 形态 | 用在哪 |
|---|---|---|---|
| **L1 纪律** | `rules/autoresearch-loop-execution.md`（+ `workflow-routing.md` / `human-gate.md`） | 散文方法论：metric 提取 / 收敛判定 / 硬停闸 / verdict 账本 / 人工卡点 | 通用，任何 agent / CLI 照搬 |
| **L2 进程内引擎** | `workflows/autoresearch-loop.mjs` | Claude Workflow 脚本，进程内 agent，有 token 账本 | Claude Code 内编排 |
| **L3 可移植引擎** | `scripts/autoresearch-loop.sh` | CLI 无关，后端可插拔（codex/claude/opencode/ollama/gemini），证据脚本自采 | 跨任意 CLI / 异构后端 |

单轮闭环：**蜂群多视角审（并行）→ 去重/severity → 命中人工卡点即 STOP → 狼群按文件分工修 → git 实证 + 测试 + 交叉校验 + 指纹越界检测 → verdict 判停**。

### 工程保证（Loop Engineering 记分卡）

- **可量化目标**：从原话提取 `goal/metric`，收敛 = 连续 N 轮「全视角 H+M=0 且测试不回退 且无越界写」
- **双硬闸防闷头烧**：轮数上限（≤8）+ token/调用预算（启动放大估算 + Fix 前投影 + 轮间滚动均值）
- **防假收敛**：视角不全记 `INCONCLUSIVE` 不计收敛；dedup 保最高 severity（L 不盖 H/M）；红着/带回退不算 clean；`TEST_STAT` 哨兵整行 + 三元组交叉校验，抓"字段与原文不符"的糊弄
- **防越界写**：每文件 ±行数指纹比对，越界文件 **sticky re-flag → 永不假收敛**；敏感路径（DDL/迁移/`.sql`）门禁即停
- **人工卡点（[[human-gate]]）**：DDL / 契约 / 金额 命中即整 loop STOP 交人工，高于一切自动编排
- **确定性安全闸**：`scripts/hooks/danger-gate.mjs` 在 PreToolUse 最前，高危操作 `exit 2` 当场拦下——机器级兜底，不靠模型自觉

> L3（shell 版）因能直接跑命令，**证据由脚本一手采集**（`git --numstat` + 测试自己跑），
> 反而把 L2 的两个工具天花板（证据靠 agent 自报、越界只能检测）补成"完全符合"。

### 用法

```bash
# L2（Claude Code 内）
Workflow({name:'autoresearch-loop', args:{repo:'<path>', testCmd:'./mvnw test -pl m -am'}})

# L3（任意装了某个 agent CLI 的机器）
~/.claude/scripts/autoresearch-loop.sh --repo <path> \
  --test-cmd './mvnw test -pl m -am' --backend codex --max-rounds 6 --min-clean 2
# 异构：review 用 codex、fix 用 claude
~/.claude/scripts/autoresearch-loop.sh --repo <path> --review-backend codex --fix-backend claude
```

### 工程出处（provenance）

L2/L3 引擎由 **codex + omp + opencode 三方异构对抗复审、≥9 轮迭代收敛**而成（每轮各方独立挑 blocking，
修到三方零异议；过程本身就是 Loop Engineering 的一次实战）。设计边界（工具天花板）已在脚本头与
`rules/autoresearch-loop-execution.md §6` 据实声明，不夸大。

---

## 1. 目录结构

```
~/.claude/
├── rules/                        # 全局规则（核心经 CLAUDE.md @import 常驻，其余按需加载；32 个 md）
│   ├── always-apply.md           # 全局编码标准（必带）
│   ├── routing-core.md           # 常驻编排核心（意图路由/蜂群狼群/卡点速查，@import）
│   ├── workflow-routing.md       # 编排路由总入口（5 合 1，alwaysApply:false 按需加载）
│   ├── real-e2e-testing.md       # 必须真实浏览器验证
│   ├── confirm-before-implement.md # 先方案后实施
│   ├── human-gate.md             # 业务对账/DDL/契约 3 道人工卡点
│   ├── codex-review-policy.md    # codex 按需调用策略
│   ├── db-perf-cover-index.md    # SUM 超时先加覆盖索引
│   └── ...（其他领域规则：java-spring / mqtt-iot / modbus 等）
│
├── workflows/                    # Loop Engineering L2 引擎
│   └── autoresearch-loop.mjs     # Claude Workflow 确定性循环（蜂群审→狼群修→验证→判停）
├── skills/                       # 自定义 skills（codex-stop-review / ultrawork / recap 等）
├── agents/                       # 自定义 agent
├── commands/                     # 自定义 slash commands
├── hooks/                        # hook 定义
│                                 # （teams/ daemon/ jobs/ 等运行时目录已 gitignore，由工具自动生成，不随仓库同步）
├── scripts/                      # hook 实现脚本 + 新机还原脚本 + Loop Engineering L3 引擎（Node.js / bash）
│   ├── bootstrap.mjs             # 新机一键还原（改路径+装插件+配 MCP+装 skill 依赖，幂等 5 步）
│   ├── setup-new-machine.mjs     # 仅改写 settings.json 硬编码路径（bootstrap 会调它）
│   ├── autoresearch-loop.sh      # Loop Engineering L3：CLI 无关循环引擎（后端可插拔，证据自采）
│   ├── verify-config.mjs         # 配置自检（settings/hooks/@import/danger-gate 行为矩阵）
│   ├── prune-scan.mjs            # 凋亡扫描（出待淘汰/待接线清单）
│   ├── hooks/
│   │   ├── danger-gate.mjs       # PreToolUse 确定性阻断闸门（高危操作 exit 2）
│   │   ├── rule-inject.mjs       # 按文件类型注入领域规范
│   │   ├── pretooluse-advisory.mjs
│   │   ├── posttooluse-advisory.mjs
│   │   ├── context-degradation-guard.mjs # PostToolUse 上下文退化预警
│   │   └── stop-console-scan.mjs
│   └── session-snapshot.mjs
├── ecc-scripts/                  # ECC（Eval-Continuous-Coverage）相关脚本
├── settings.json                 # 全局配置（hooks/permissions/env）
├── statusline-command.sh         # 状态栏脚本
└── projects/
    └── D--projects-demo-project/
        └── memory/               # demo-project 项目专属 memory
            ├── MEMORY.md
            └── project_inverter_history_perf.md
```

---

## 2. 一键克隆（新电脑首次设置）

### 2.1 准备工作

```bash
# 备份新电脑可能已有的 ~/.claude
mv ~/.claude ~/.claude.backup 2>/dev/null || true

# 克隆配置
git clone https://github.com/ZDragon17/claude-config.git ~/.claude
cd ~/.claude
```

### 2.2 平台特定路径调整（**必做！**）

`settings.json` 里写死了 Windows 路径，必须改成新电脑的真实路径。

> 💡 不想手动替换？直接跑 `node scripts/setup-new-machine.mjs` 自动改写（幂等、带 `.bak` 备份）。本节是它的手动等价做法，仅在脚本报错排查时需要。

#### Windows → Windows（同系统不同用户名）

打开 `~/.claude/settings.json`，**全文搜索替换**：

```
C:\\Users\\作者   →   C:\\Users\\新用户名
```

涉及位置：
- `env.HOME`
- `env.USERPROFILE`
- `hooks.PostToolUse[].hooks[].command`
- `hooks.PreToolUse[].hooks[].command`
- `hooks.Stop[].hooks[].command`（2 处）
- `hooks.PreCompact[].hooks[].command`
- `hooks.SessionStart[].hooks[].command`
- `statusLine.command`

或者用 PowerShell 一键替换：
```powershell
(Get-Content $HOME\.claude\settings.json) `
  -replace 'C:\\\\Users\\\\作者', "C:\\Users\\$env:USERNAME" `
  | Set-Content $HOME\.claude\settings.json
```

#### Windows → Mac

```bash
cd ~/.claude
cp settings.json settings.json.win.bak

# Mac 用户目录是 /Users/yourname
NEW_HOME="/Users/$USER"

# 替换路径（macOS sed 需要 -i ''）
sed -i '' \
  -e "s|C:\\\\\\\\Users\\\\\\\\作者|$NEW_HOME|g" \
  -e 's|\\\\|/|g' \
  settings.json
```

#### Windows → Linux

```bash
cd ~/.claude
cp settings.json settings.json.win.bak

NEW_HOME="/home/$USER"

sed -i \
  -e "s|C:\\\\\\\\Users\\\\\\\\作者|$NEW_HOME|g" \
  -e 's|\\\\|/|g' \
  settings.json
```

**改完后验证路径**：
```bash
grep -E '"(HOME|USERPROFILE|command)"' ~/.claude/settings.json
```
确认所有路径都指向新电脑的真实位置。

### 2.3 创建 `settings.local.json`（本地配置，仓库未带）

```bash
cat > ~/.claude/settings.local.json <<'EOF'
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": [
    "jetbrains"
  ]
}
EOF
```

### 2.4 创建 `mode.json`（工作模式，仓库未带）

```bash
cat > ~/.claude/mode.json <<'EOF'
{
  "currentMode": "standard",
  "lastUpdated": "2026-01-01T00:00:00Z",
  "modes": {
    "fast":     { "name": "快速模式", "enabled": { "todoWrite": false, "codeReview": false,        "autoTest": false,        "qualityCheck": false } },
    "standard": { "name": "标准模式", "enabled": { "todoWrite": true,  "codeReview": "suggest",    "autoTest": "suggest",    "qualityCheck": true  } },
    "strict":   { "name": "严格模式", "enabled": { "todoWrite": true,  "codeReview": "mandatory",  "autoTest": "mandatory",  "qualityCheck": true  } }
  }
}
EOF
```

---

## 3. 前置工具安装

### 3.1 必装

| 工具 | 用途 | Windows | Mac | Linux |
|---|---|---|---|---|
| **Claude Code** | 主程序 | [官网下载](https://docs.claude.com/claude-code) | 同左 | 同左 |
| **Node.js ≥ 18** | hook 脚本运行时 | `winget install OpenJS.NodeJS` | `brew install node` | `apt install nodejs` |
| **Git** | 同步本仓库 | 默认有 | 默认有 | 默认有 |

### 3.2 强烈推荐

| 工具 | 用途 | Windows | Mac | Linux |
|---|---|---|---|---|
| **Codex CLI** | 异构二审（codex review）| `npm i -g @openai/codex` | 同左 | 同左 |
| **jq** | JSON 处理（部分 skill 依赖）| `scoop install jq` | `brew install jq` | `apt install jq` |
| **tmux** | 长任务后台运行（real-e2e-testing 依赖）| WSL 内装 | `brew install tmux` | `apt install tmux` |
| **gh CLI** | GitHub 操作 | `winget install GitHub.cli` | `brew install gh` | `apt install gh` |

### 3.3 可选（按工作流需要）

- **chrome-devtools MCP**（前后端联调验证用）— 在 Claude Code 内通过 MCP 配置
- **Java JDK 21 + Maven**（demo-project 项目用）
- **Python 3.11+**（autoresearch 部分子命令用）

---

## 4. Marketplace + Plugin 重装

**仓库不带 `plugins/cache/` 和 `plugins/marketplaces/`**（体积大且新机重装更干净）。新电脑必须重新添加 marketplace 和 install plugin。

### 4.1 添加 8 个 marketplaces

在 Claude Code 会话里依次执行：

```
/plugin marketplace add daymade/claude-code-skills
/plugin marketplace add wshobson/agents
/plugin marketplace add anthropics/skills
/plugin marketplace add obra/superpowers-marketplace
/plugin marketplace add forrestchang/andrej-karpathy-skills
/plugin marketplace add openai/codex-plugin-cc
/plugin marketplace add uditgoenka/autoresearch
/plugin marketplace add anthropics/claude-plugins-official
```

### 4.2 安装核心 plugins（按重要性排序）

**最核心（必装，作者日常工作流依赖）**：
```
/plugin install autoresearch@autoresearch
/plugin install codex@openai-codex
/plugin install andrej-karpathy-skills@karpathy-skills
/plugin install superpowers@superpowers-marketplace
```

**daymade-skills（生产力 skill 集合）**：
```
/plugin install skill-creator@daymade-skills
/plugin install github-ops@daymade-skills
/plugin install skills-search@daymade-skills
/plugin install ui-designer@daymade-skills
/plugin install prompt-optimizer@daymade-skills
/plugin install mermaid-tools@daymade-skills
/plugin install markdown-tools@daymade-skills
/plugin install pdf-creator@daymade-skills
```

**Anthropic 官方 skills**：
```
/plugin install document-skills@anthropic-agent-skills
/plugin install mcp-builder@anthropic-agent-skills
/plugin install webapp-testing@anthropic-agent-skills
```

**superpowers 扩展**：
```
/plugin install double-shot-latte@superpowers-marketplace
/plugin install episodic-memory@superpowers-marketplace
```

**claude-plugins-official**：
```
/plugin install frontend-design@claude-plugins-official
/plugin install jdtls-lsp@claude-plugins-official
```

**claude-code-workflows（30+ 个工作流插件，按需装）**：
```
# 后端 / 数据库 / 安全 / 测试
/plugin install backend-development@claude-code-workflows
/plugin install backend-api-security@claude-code-workflows
/plugin install database-design@claude-code-workflows
/plugin install database-migrations@claude-code-workflows
/plugin install database-cloud-optimization@claude-code-workflows
/plugin install code-review-ai@claude-code-workflows
/plugin install security-scanning@claude-code-workflows
/plugin install unit-testing@claude-code-workflows
/plugin install tdd-workflows@claude-code-workflows

# Git/CI/CD
/plugin install git-pr-workflows@claude-code-workflows
/plugin install cicd-automation@claude-code-workflows
/plugin install application-performance@claude-code-workflows
/plugin install incident-response@claude-code-workflows

# 语言/全栈
/plugin install jvm-languages@claude-code-workflows
/plugin install full-stack-orchestration@claude-code-workflows
/plugin install data-engineering@claude-code-workflows
/plugin install javascript-typescript@claude-code-workflows
/plugin install python-development@claude-code-workflows

# 云原生
/plugin install kubernetes-operations@claude-code-workflows
/plugin install cloud-infrastructure@claude-code-workflows
/plugin install payment-processing@claude-code-workflows

# 调试/重构/文档
/plugin install debugging-toolkit@claude-code-workflows
/plugin install error-diagnostics@claude-code-workflows
/plugin install error-debugging@claude-code-workflows
/plugin install dependency-management@claude-code-workflows
/plugin install code-refactoring@claude-code-workflows
/plugin install codebase-cleanup@claude-code-workflows
/plugin install documentation-generation@claude-code-workflows
/plugin install code-documentation@claude-code-workflows
/plugin install c4-architecture@claude-code-workflows

# API/前端/移动
/plugin install api-scaffolding@claude-code-workflows
/plugin install api-testing-observability@claude-code-workflows
/plugin install comprehensive-review@claude-code-workflows
/plugin install frontend-mobile-development@claude-code-workflows
/plugin install frontend-mobile-security@claude-code-workflows

# 部署/监控
/plugin install deployment-strategies@claude-code-workflows
/plugin install deployment-validation@claude-code-workflows
/plugin install observability-monitoring@claude-code-workflows
/plugin install distributed-debugging@claude-code-workflows

# LLM/AI
/plugin install llm-application-dev@claude-code-workflows
/plugin install machine-learning-ops@claude-code-workflows
/plugin install agent-orchestration@claude-code-workflows
```

### 4.3 重新加载

所有 plugin 装完后：
```
/reload-plugins
```

---

## 5. 验证清单（确保完全复现原工作环境）

### 5.1 全局规则加载验证

新开会话问：
```
我的全局 rules 里有 routing-core.md 吗？里面写了什么？
```

✅ 能复述「5 类意图基础栈、蜂群/狼群读写区分、人工卡点速查」内容 → 规则加载成功
❌ 答不上来 → 检查 `CLAUDE.md` 是否 @import 了 `routing-core.md`（及 human-gate/user-profile/always-apply），frontmatter 是否带 `alwaysApply: true`

### 5.2 Hooks 路径验证

```bash
# 必须在 shell 里能跑通：
ls ~/.claude/scripts/hooks/  # 应该看到 5 个 .mjs（含 danger-gate / context-degradation-guard）
node ~/.claude/scripts/hooks/stop-console-scan.mjs < /dev/null  # 应无报错
node ~/.claude/scripts/session-snapshot.mjs < /dev/null  # 应无报错
```

如果 hook 路径错（"找不到文件"）→ 回 §2.2 重新调整 settings.json 路径

### 5.3 行为触发验证（**最关键**）

新开会话依次测试这 3 条最重要的规则触发：

**测试 1：autoresearch 升级**
```
循环蜂群审一遍这个项目的代码，直到没扫出新问题
```
✅ 期望：复述「机制=蜂群 fanout，metric=连续 N 轮零新 finding，开跑？」
❌ 直接派一次 subagent 就结束 → `workflow-routing.md`（autoresearch 升级规则）没生效

**测试 2：人工卡点触发**
```
帮我改下 user 表，加个 deleted_at 字段做软删除
```
✅ 期望：触发 DDL 卡点 2，要求列影响范围 + DBA 双签
❌ 直接写 ALTER TABLE SQL → `human-gate.md` 没生效

**测试 3：codex 按需触发**

写完一段并发代码（如 Redis SETNX 限流器）后看反应。

✅ 期望：主动说「这段涉及并发+幂等，命中 codex 触发条件，现在跑 `codex review --uncommitted`」
❌ 写完就交差不审 → `codex-review-policy.md` 没生效

### 5.4 Marketplace + Plugin 验证

```
/plugin list
```
✅ 应该看到 60+ 个已装 plugin

```
/plugin marketplace list
```
✅ 应该看到 8 个 marketplace

### 5.5 项目级 memory 验证（仅 demo-project）

```bash
cat ~/.claude/projects/D--projects-demo-project/memory/MEMORY.md
cat ~/.claude/projects/D--projects-demo-project/memory/project_inverter_history_perf.md
```

✅ 应该看到两个文件都存在且内容完整

---

## 6. 日常维护

### 6.1 修改配置后推送

```bash
cd ~/.claude
git add .
git commit -m "feat(rules): xxx" -m "具体改动说明"
git push
```

**注意**：常用 conventional commit 类型（参考 `~/.claude/rules/git-commit.md`）：
- `feat(rules)`: 新增规则
- `fix(skills)`: 修 skill bug
- `chore(settings)`: 设置调整
- `docs`: 文档更新

### 6.2 其他电脑同步最新

```bash
cd ~/.claude
git pull
# 如果 settings.json 路径有冲突，按 §2.2 平台特定路径再次处理
```

### 6.3 路径分歧的处理（跨平台同步问题）

`settings.json` 的路径在不同电脑上不同。如果你两台电脑都频繁改配置，推荐：

**方案 A（推荐）**：每台电脑维护自己的 `settings.json`，从仓库排除
```bash
# 在每台电脑独立维护，git pull 不覆盖本地
git update-index --skip-worktree settings.json
# 取消：git update-index --no-skip-worktree settings.json
```

**方案 B**：用模板 + 启动脚本动态生成 `settings.json`（更复杂，仅在频繁跨平台时考虑）

### 6.4 项目级 memory 同步

`projects/{项目名}/memory/` 是跨电脑同步的（`.gitignore` 里特意 unignore）。但 `projects/*.jsonl`（会话记录）和 `projects/{项目名}/.*` 其他文件**不同步**（机器特定）。

新项目想跨机同步 memory：
```bash
mkdir -p ~/.claude/projects/项目名/memory
# 写 MEMORY.md + project_*.md
git add projects/项目名/memory
git commit -m "feat(memory): add 项目名 project memory"
git push
```

### 6.5 添加新全局规则的流程

1. 在 `~/.claude/rules/{rule-name}.md` 写规则（带 `alwaysApply: true` frontmatter）
2. 测试一下当前会话不能验证（规则在会话启动时加载）—— 必须开新会话才会生效
3. 在新会话里问 "我的全局规则里有 {rule-name} 吗，验证一下" 确认
4. `git add rules/{rule-name}.md && git commit -m "feat(rules): 新增 xxx 规则" && git push`

---

## 7. 故障排查

### 7.1 hook 不触发 / 报错

**症状**：会话开始/结束没有自动注入快照，或 console 报路径错。

**排查**：
1. 检查 `settings.json` 里 hook 的 `command` 路径是否指向真实存在的文件：
   ```bash
   cat ~/.claude/settings.json | grep -A 3 '"command"'
   ```
2. 跑命令验证：`node "<那个路径>" < /dev/null`
3. 如果报 Node 找不到，确认 PATH 里有 node：`which node` / `where node`
4. 如果路径里有中文（如 `作者`），确认 shell 编码是 UTF-8

### 7.2 规则没生效 / 不能自动编排

**症状**：你说"循环狼群修到测试绿"，Claude 没升级 autoresearch。

**排查**：
1. 确认 `~/.claude/rules/routing-core.md`（常驻核心）和 `workflow-routing.md`（按需详细手册）存在
2. 看 frontmatter：`head -5 ~/.claude/rules/routing-core.md` 应该有 `alwaysApply: true`（且被 `CLAUDE.md` @import）
3. **开新会话**（旧会话已加载的 system prompt 是快照，不会动态更新）
4. 在新会话问 "我的全局规则里有 routing-core 吗" 验证加载

### 7.3 plugin/skill 调用失败

**症状**：调 autoresearch 报"找不到 skill"。

**排查**：
1. `/plugin list` 看有没有 autoresearch
2. 没有 → 走 §4.2 重装
3. 有但报错 → `/reload-plugins`
4. 还是不行 → 看 `~/.claude/plugins/cache/autoresearch/` 是否有内容

### 7.4 codex CLI 找不到

**症状**：触发 codex review 报 "command not found"。

**排查**：
1. `which codex` / `where codex` 看 PATH
2. 没装 → `npm i -g @openai/codex`
3. 装了但 PATH 没生效 → 重启 Terminal / 重新登录 shell
4. Windows 上 npm 全局目录要加到 PATH：`%APPDATA%\npm`

### 7.5 git pull 冲突

**症状**：`git pull` 时 settings.json / mode.json 冲突。

**处理**：
1. 这两个文件每台机器内容可能不同
2. 解决：在每台机器跑 `git update-index --skip-worktree settings.json mode.json`（让 git 忽略本地改动）
3. 真正需要同步时再 `git update-index --no-skip-worktree settings.json` 临时取消

### 7.6 中文用户名导致路径乱码

**症状**：路径里有中文（如 `作者`），脚本运行报编码错。

**处理**：
- Windows：在 PowerShell 跑 `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8`
- Git Bash：应该没问题
- WSL：用 Linux 用户目录，避免读 Windows 中文路径

---

## 8. 核心规则速查（顶层 anchor）

| 你说什么 | 我会做什么 | 来源规则 |
|---|---|---|
| **狼群/蜂群**（无循环信号）| Team / subagent fanout 一次性 | routing-core.md |
| **狼群/蜂群 + 直到/循环/反复** | 升级 autoresearch 循环 | routing-core.md（详见 workflow-routing.md）|
| **盯着 / 持续监控 / 等它跑完** | 启动 loop | routing-core.md |
| **做完 / 搞定 / 修完 / 端到端** | ultrawork 全闭环 | routing-core.md |
| **codex 审 / 复核** | 召 codex review | codex-review-policy.md |
| **DDL / 改字段 / 改 DTO** | 触发人工卡点（停下等签字）| human-gate.md |
| **UI 改动** | 必启 chrome-devtools 真实验证 | real-e2e-testing.md |
| **这个套路记下来 / 沉淀一下** | 输出 SKILL.md / rule 草稿等你审 | workflow-routing.md §自学习节点 |
| **复盘 / 看看最近规律** | 扫历史会话挖候选规则 | workflow-routing.md §自学习节点 |

详细见 `~/.claude/rules/workflow-routing.md`（按需展开的完整手册；常驻精简版见 routing-core.md）。

---

## 9. 该排除的（已配置在 .gitignore）

仓库 **不带** 这些（机器特定/临时/会泄露隐私）：

- `cache/` / `backups/` / `file-history/` / `paste-cache/` / `debug/` / `downloads/`
- `sessions/` / `shell-snapshots/` / `todos/` / `transcripts/` / `tasks/`
- `telemetry/` / `statsig/` / `session-env/` / `ide/`
- `history.jsonl` / 所有 `*.jsonl` / `context-smart-state.json` / `current-persona.txt` / `stats-cache.json` / `mcp-needs-auth-cache.json`
- `*.bak` / `*.deprecated` / `output-styles.deprecated/`
- `projects/*.jsonl` / `projects/*/`（**但保留** `projects/*/memory/`）
- `plugins/cache/` / `plugins/marketplaces/` / `plugins/data/`（运行时数据）
- `settings.local.json` / `mode.json`（本地机器配置）
- `plugins/installed_plugins.json` / `plugins/blocklist.json` / `plugins/plugin-catalog-cache.json`

---

## 10. 安全注意

- ⚠️ **本仓库设为 Private**，包含工作习惯、项目结构、agent 偏好等敏感信息
- ⚠️ **API key / token 永不要提交**，已通过 `.gitignore` 严格排除
- ⚠️ **添加新规则前扫一遍**：
  ```bash
  grep -riE "(sk-|ghp_|gho_|github_pat_|aws_access|private_key|password=|token=)" \
    ~/.claude/rules ~/.claude/skills ~/.claude/scripts ~/.claude/settings.json
  ```
  确认无密钥再 push
- ⚠️ **commit message 不要含敏感信息**（项目名/路径可以，密码/key 不行）

---

## 11. 系统要求

- Claude Code ≥ 最新版本
- Node.js ≥ 18
- Git ≥ 2.30
- 磁盘空间：克隆后约 15MB，正常使用后含缓存约 200MB

---

## 12. 一份完整迁移 checklist（直接照做）

新电脑全新设置，**预计 30 分钟**：

```
[ ] 1. 装 Claude Code、Node.js、Git
[ ] 2. mv ~/.claude ~/.claude.backup （保险）
[ ] 3. git clone https://github.com/ZDragon17/claude-config.git ~/.claude
[ ] 4. 按 §2.2 改 settings.json 路径（最容易出问题的一步）
[ ] 5. 按 §2.3 / §2.4 创建 settings.local.json 和 mode.json
[ ] 6. （可选）装 Codex CLI、jq、tmux、gh
[ ] 7. 启动 Claude Code，按 §4.1 添加 8 个 marketplace
[ ] 8. 按 §4.2 install 核心 4 个 plugin（先装核心，其他按需）
[ ] 9. /reload-plugins
[ ] 10. 按 §5 验证三件事：规则加载、hook 运行、行为触发
[ ] 11. 成功 → 删除 ~/.claude.backup
[ ] 12. 失败 → 看 §7 故障排查，或回退到 backup
```

---

## 13. 联系

- 仓库：https://github.com/ZDragon17/claude-config
- 作者：作者 (gragoncode@gmail.com)

如新电脑迁移过程中遇到问题，**在原电脑的 Claude Code 会话里说 "迁移到新机器有问题，看一下"**，我会给出针对性排查建议。
