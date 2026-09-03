# Claude 配置索引（当前状态速览）

> 更新：2026-09-03（两层重构后更新）
> 设计哲学与各层分工的**权威说明**见 `docs/claude-config-体系分享.md`，本文件只做"现在到底装了什么"的速览。
>
> **两层结构**：通用层（`AGENTS.md` + `rules/` + `skills/` + `projects/`，agent 无关）在仓库根；
> Claude Code 专属层（hooks / agents / commands / settings.json 等）统一在 `claude-code/` 下。

## 五层结构

| 层 | 加载时机 | 位置 | 现状 |
|---|---|---|---|
| rules | 常驻由 AGENTS.md/CLAUDE.md 加载 | `rules/`（32 个） | 核心内联 AGENTS.md，全文经桥接 @import，其余按需 Read |
| skills | 命中触发词加载 | `skills/` | 含 ultrawork / codex-stop-review / digital-twin / ecc-* / paseo-* 等 |
| agents | 派 subagent 时 | `claude-code/agents/`（26 个） | 已从 54 精简，归档 28 个低价值/未采用 agent + 解重名，保留路由引用的 debugger/performance-engineer |
| hooks | 工具/会话生命周期 | `claude-code/scripts/hooks/` + `claude-code/scripts/` | 见下表 |
| memory | 项目会话注入索引 | `projects/{项目}/memory/` | 项目特有经验（真实记忆不入库，仅 master 私有跟踪） |

## 常驻规则（CLAUDE.md `@import`，确保被加载）

- `rules/routing-core.md` — 路由核心（意图选栈 + 蜂群/狼群 + 信号叠加）
- `rules/human-gate.md` — 3 道人工卡点（业务对账 / 生产变更 / 跨仓库契约）
- `rules/user-profile.md` — 用户档案（背景/偏好/不喜欢）
- `rules/always-apply.md` — 全局编码标准

> 其余 rules/ 为按需手册：`workflow-routing.md`（详细编排，6.15KB）、`autoresearch-loop-execution.md`（循环执行手册）、各语言/领域规范（java-spring/python/go/vue/react/typescript/sql/mqtt-iot/modbus-protocol/iot-device…）、工程经验（real-e2e-testing/db-perf-cover-index/git-*…）。

## Hooks（确定性自动化，注册于 `claude-code/settings.json`）

| 时机 | 脚本 | 作用 |
|---|---|---|
| PreToolUse | **danger-gate.mjs**（阻断，exit 2） | 高危操作硬卡点：DDL/批量DML无WHERE/灾难性 rm → 阻断等确认（放行口：命令含"已知风险"/"gate-ack"） |
| PreToolUse | pretooluse-advisory.mjs（提示） | dev server/长命令进 tmux、git push 前确认、拦野 md |
| PostToolUse | posttooluse-advisory.mjs（提示） | 写完即扫 console.log/调试代码、prettier、tsc |
| PostToolUse | **context-degradation-guard.mjs**（提示） | 上下文占用接近退化区（750k/900k）提示 /clear |
| Stop | stop-console-scan.mjs + session-snapshot.mjs | 回合末兜底扫调试语句 + 写会话快照 |
| PreCompact / SessionStart | session-snapshot.mjs | 会话快照续接 |

## Commands（`/command`）

`commit-fast` · `review-code` · `refactor` · `fix-bug` · `explain` · `gen-tests` · `security-review` · `create-pr`

## 插件（`claude-code/settings.json` `enabledPlugins`）

autoresearch（迭代循环引擎）· codex（异构二审）· superpowers · jdtls-lsp · frontend-design · feature-dev · playwright · plugin-dev · pr-review-toolkit · commit-commands · code-review

## 关键开关（`claude-code/settings.json`）

- `model: opus` · `effortLevel: medium`（大上下文降 malformed 概率）
- `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`（狼群/Team）· `CLAUDE_CODE_WORKFLOWS=1`
- `skipDangerousModePermissionPrompt: true`（原生弹窗关，危险操作由 danger-gate hook 兜底）
