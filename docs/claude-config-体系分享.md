# Claude Code 全局配置体系分享

> 作者：作者 · 2026-06　|　适用：Claude Code CLI（Windows）
> 目的：把我 `~/.claude` 的整套配置逻辑讲清楚，方便你们按需复刻。

## 一、设计哲学（先读这个再看细节）

整套体系围绕 4 条原则展开：

1. **AI 的价值在于承担判断**。任何"需要看时机做的事"都让 AI 自主判断 + 直接动作，
   不靠用户手动敲命令触发。用户原话："我如果都手动，我还要你干嘛"。
2. **该自动的全自动，该停的强制停**。用 3 道人工卡点（业务对账 / 生产变更 / 跨仓库契约）
   把 AI 锁在边界内，剩下 80% 的开发执行全部放权。
3. **实证验证，拒绝伪完成**。编译过 ≠ 功能可用。联调必须真实启动服务 + 浏览器走通；
   bug 修复必须补测试跑绿；agent 干没干活看 `git diff` 不看它自报。
4. **单一信源 + 锚点引用**。规则之间用 `[[name]]` 互链，重复内容硬合并进总入口后
   删除旧文件，避免双源分叉（例：5 个编排规则合并进 `workflow-routing.md` 并删除）。

## 二、五层结构总览

```
~/.claude/
├── rules/        ← 第 1 层：规则（32 个 md；核心 4 个经 CLAUDE.md @import 常驻，其余按需）
├── skills/       ← 第 2 层：按需工作流（触发才加载，省 context）
├── agents/       ← 第 3 层：子代理定义（蜂群/狼群的兵源）
├── scripts/hooks ← 第 4 层：hooks 脚本（确定性自动化，不靠模型自觉）
├── projects/*/memory/ ← 第 5 层：项目级记忆（跨会话持久）
└── settings.json ← 全局开关：plugins / hooks 注册 / env / 权限
```

各层的分工逻辑：

| 层 | 加载时机 | 放什么 | 不放什么 |
|---|---|---|---|
| rules | 每次会话常驻 | 工作方式、编排路由、安全边界、技术栈规范 | 长篇执行手册（占 context） |
| skills | 命中触发词才加载 | 多步骤工作流（ultrawork / codex 复核手册等） | 一句话能说清的规则 |
| agents | 派发 subagent 时 | 各专业视角的子代理 system prompt | — |
| hooks | 工具调用/会话生命周期 | 必须 100% 执行的事（快照、扫描、提醒） | 依赖模型"自觉"的事 |
| memory | 项目会话自动注入索引 | 项目特有经验、踩坑记录、修复历史 | 全局通用的工作方式 |

**核心分界**：rules 管"怎么决策"，skills 管"怎么执行"，hooks 管"必须发生"，
memory 管"项目记得什么"。判断一个东西放哪，问一句：它需要每次会话都在脑子里吗？

## 三、第 1 层：rules（32 个文件，4 大类）

### 3.1 编排路由类（体系的发动机）

- **`routing-core.md`** — 常驻编排核心，经 `CLAUDE.md` @import 每次会话注入：按**意图**
  选基础栈（探索/实现/修bug/审查/完整交付 5 类）+ 按**叠加信号位**追加节点
  （循环→autoresearch、二审→codex、UI→浏览器真实验证、盯→loop）+ 蜂群/狼群与卡点速查。
- **`workflow-routing.md`** — 上面这张表的完整手册（5 合 1，`alwaysApply: false` 按需 Read），
  已从 18.2KB 精简到 6.15KB；命中后要细则才读，平时不占常驻 context。
- **`autoresearch-loop-execution.md`** — autoresearch 实战手册（5 阶段流程 +
  8 个真实陷阱 + 收敛判断）。确认要跑循环时才 Read，平时不占 context。
- 原 `team-mode-trigger.md` / `autoresearch-trigger.md` / `loop-mode-trigger.md` /
  `composite-workflow.md` / `orchestration-playbook.md` 已**硬合并进 `workflow-routing.md` 并删除**
  （不再保留 stub 文件，旧引用的向后兼容靠 git 历史）。

**蜂群 vs 狼群**（这套体系的核心隐喻，读写分离的并行模型）：

| 词 | 机制 | 用途 |
|---|---|---|
| 蜂群 | subagent fanout，结果汇总回主 agent | 并行**读**：审查/评估/调研 |
| 狼群 | 多 Agent 并行写（默认）或 Team 协作（≥5 文件） | 并行**写**：改代码/分模块修复 |

铁律：同一文件不能被两个 agent 同时编辑。实测数据写进了规则里：
Team 模式 teammate 主动汇报率仅 ~20%，Agent fanout 同步返回 100% 可靠，
所以狼群默认走 fanout，真需要 agent 间协作才升 Team。

### 3.2 安全边界类（"该停的地方停"）

- **`human-gate.md`** — 3 道强制人工卡点：①业务对账（金额/统计/报表，测试绿 ≠
  业务对，需业务方签字）②生产变更（DDL/批量 DML/部署脚本，需列影响范围+回滚方案）
  ③跨仓库契约（DTO/OpenAPI/MQTT topic 改动，需产 diff 提示对端同步）。
  优先级**高于**一切自动编排。
- **`confirm-before-implement.md`** — 方向不确定/不可逆 → 先出方案等确认；
  意图明确 → 自主执行不反问。区分"该确认"和"弱智式反复确认"。
- **`autonomous-judgment.md`** — 自主判断兜底：补测试、起监控、调二审、
  开并行，都是 AI 自己看时机干，干完汇报。
- **`codex-review-policy.md`** — 异构二审按需判定（不是每次都跑）：
  并发/状态机/幂等/安全/金额类 diff 必审，typo/文档/样式跳过。
  "自己心里不踏实"是兜底信号。

### 3.3 工程经验类（踩坑沉淀，每条都有真实案例）

- `real-e2e-testing.md` — 联调必须真实启动 + chrome-devtools 浏览器走通，1-2 小时是正常预期
- `db-perf-cover-index.md` — 全表 SUM 超时先 EXPLAIN 再加覆盖索引（110s→秒级实战）
- `git-merge-remote-tracking.md` — 合远程分支必须用 `origin/<branch>`（漏 31 个 commit 的事故复盘）
- `git-secret-scrub.md` — secret 误提交后的 filter-repo 标准流程 + revoke 不可省
- `tool-fit-over-tool-coverage.md` — 新工具只用在 sweet spot，选型必出适配分类表
- `license-constraints.md` — 推荐第三方前查许可证，AGPL/SSPL/BSL 默认不推

### 3.4 技术栈规范类（按语言/领域拆分）

通用：`always-apply.md`（中文回复、代码质量、错误处理）、`git-commit.md`、
`api-design.md`、`security.md`、`testing.md`、`sql.md`、`docker-k8s.md`、`markdown.md`
语言：`java-spring.md`、`python.md`、`go.md`、`typescript.md`、`react.md`、`vue.md`
领域（IoT 是主业）：`mqtt-iot.md`、`modbus-protocol.md`、`iot-device.md`、`websocket-push.md`

另有 **`user-profile.md`** — 把自己的技术背景、协作偏好、"不喜欢什么"写成档案，
让 AI 自动校准解释深度和方案颗粒度。这是性价比最高的一个文件，强烈建议先抄这个。

## 四、第 2 层：skills（按需加载的工作流）

放在 `~/.claude/skills/{name}/SKILL.md`，命中触发词才加载，不占常驻 context。重点几个：

- **`ultrawork`** — 全闭环交付管道：意图分析 → 规划 → 并行实施 → 真实验证 →
  独立复核 → 交付。说"做完它/搞定/ulw"触发，内部按复杂度自动分快线/全管道。
- **`codex-stop-review`** — codex 二审的执行手册（`codex-review-policy.md` 规则是
  anchor，skill 是 manual，规则负责"何时"，skill 负责"怎么做"）。
- **`digital-twin`** — 数字员工：把自己的项目经验和决策规则写成 skill，
  技术选型/架构设计类问题直接按本人风格给可执行方案。
- `ecc-*` 系列 — TDD 工作流、安全 checklist、持续学习等（来自社区，按需启用）。
- 实用工具类：`tmux`（远程操控交互式 CLI）、`github`（gh CLI）、`jq`、`tldr`。

插件（settings.json `enabledPlugins`）：
- **`autoresearch`** — 自主迭代循环引擎（:fix / :debug / :security / :reason 等子命令）
- **`codex`** — OpenAI Codex 异构二审（/codex:review、/codex:adversarial-review、/codex:rescue）
- `jdtls-lsp` — Java LSP；`understand-anything` — 代码库理解

## 五、第 3 层：agents（子代理库）

`~/.claude/agents/` 下 26 个专业子代理定义（原 54 个，已把 28 个低价值/未用的归档到
`_archive/agents-stubs/`）：security-reviewer、code-reviewer、architect-reviewer、
debugger、performance-engineer……这是蜂群/狼群的兵源。

经过实战验证的**黄金三视角**审查组合：`security-reviewer` + `code-reviewer` +
`architect-reviewer` 并行 fanout，覆盖安全/正确性/架构三个互补维度。
派发 prompt 的要点也沉淀成了模板（见 autoresearch-loop-execution.md）：
给精确文件路径、给契约参考、限定 finding 数量防凑数、要求固定格式汇报。

## 六、第 4 层：hooks（确定性自动化）

原则：**凡是"必须 100% 发生"的事不靠模型自觉，写成 hook 脚本**。
注册在 settings.json，脚本在 `~/.claude/scripts/`，全部 Node.js（跨项目零依赖）。

| Hook 时机 | 脚本 | 干什么 |
|---|---|---|
| SessionStart / Stop / PreCompact | `session-snapshot.mjs` | **会话快照续接**：Stop 时把 git 状态/改动/最近 commits 抽到 `session-snapshot.md`，新会话自动注入——上下文丢了也能无缝接上 |
| PreToolUse | `danger-gate.mjs` | **确定性阻断闸门**：命中高危操作（DDL/批量 DML/`rm -rf`/PowerShell 递归删除/SQL 文件执行/迁移）→ **exit 2 阻断** + stderr 回灌，是 human-gate 卡点 2 的硬兜底（命令含「已知风险」/「gate-ack」放行） |
| PreToolUse | `pretooluse-advisory.mjs` | 建议性提醒：dev server/长命令进 tmux、git push 前确认、拦截乱建非标准 md 文档 |
| PostToolUse | `posttooluse-advisory.mjs` | 写完代码即时扫 `console.log`/调试代码，提交前提醒清理 |
| PostToolUse | `context-degradation-guard.mjs` | 上下文退化预警：接近 1M 上限退化高发区（750k 起警告、900k 强烈警告）时 stderr 提示 `/clear`（纯只读，永远 exit 0 不阻断） |
| Stop | `stop-console-scan.mjs` | 回合结束扫 git diff 里的 JS/TS 改动文件，兜底查遗留调试语句 |

advisory hook（pretooluse/posttooluse-advisory、context-degradation-guard、stop-console-scan）仍是**提示不阻断**（exit 0 + stderr），保持流畅度；
但高危操作不再只靠模型自觉——`danger-gate.mjs` 在 PreToolUse 用 **exit 2 确定性阻断**，给 rules 层的人工卡点加了 hook 兜底，两层互补。

## 七、第 5 层：项目 memory

`~/.claude/projects/{项目}/memory/`，每个事实一个 md 文件 + `MEMORY.md` 索引
（索引每次会话自动注入，正文按需读）。放的是**代码和 git 历史推不出来的东西**：

- 踩坑根因（如"Modbus 帧声明长度 > 实际长度时末尾 2 字节是校验码不是数据"）
- 厂商边界（如"MQTT broker 归厂商，只能应用层补偿"）
- 协作反馈（如"安全风险按仓库可见性调权重"）

红线：全局通用的工作方式**不要**塞项目 memory（应进 `~/.claude/rules/`），
反过来项目特有经验也不要污染全局。

## 八、settings.json 关键开关

```jsonc
{
  "effortLevel": "medium",            // 配合本机稳定性：大上下文下降低 malformed 概率
  "includeCoAuthoredBy": false,       // commit 不带 Co-Authored-By
  "enabledPlugins": ["autoresearch@autoresearch", "codex@openai-codex", ...],
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1",  // 开 Team 协作模式
    "CLAUDE_CODE_WORKFLOWS": "1",                 // 开 Workflow 确定性编排
    "DISABLE_TELEMETRY": "1",
    "MCP_TIMEOUT": "60000"
  },
  "hooks": { /* 见第六节，5 个生命周期全挂 */ }
}
```

MCP servers 保持克制，只挂 2 个常用的：`chrome-devtools`（前端真实验证的核心工具，
替代 Playwright）和 `dbx`（数据库直查）。MCP 挂太多会撑爆 context、拖慢会话，
按"工具适配需求"原则只留高频的。

## 九、给同事的复刻建议（按 ROI 排序）

不建议整套照搬——这套配置是一年多实战逐条沉淀的，直接全量复制会水土不服。
建议按这个顺序起步：

1. **先写 `user-profile.md`**（10 分钟）：技术背景 + 协作偏好 + 不喜欢什么。
   这一个文件就能显著改善 AI 的回答颗粒度。
2. **抄 `human-gate.md` + `confirm-before-implement.md`**：安全边界先立起来，
   再谈放权。卡点关键词按你的业务改（我的是金额/DDL/契约，你的可能不同）。
3. **抄 `real-e2e-testing.md`**：根治"编译过就说搞定"的伪验证，这是最痛的点。
4. **挂 `session-snapshot.mjs` hook**：会话续接体验提升立竿见影，脚本可直接拿走。
5. **技术栈规范挑自己用的抄**（java-spring / vue / sql……），不用的别放，
   常驻 rules 每个字都占 context。
6. **编排体系（蜂群/狼群/autoresearch）最后上**：它依赖你已经信任 AI 的自主判断，
   前面 1-5 跑顺了再引入，否则并行 agent 只会放大混乱。

### 维护心法

- **每条经验规则都要有真实案例**：写"为什么"和事故复盘，不写空洞的最佳实践。
  没有 Why 的规则下次自己都不信。
- **少而精，不是多而全**：skill/rule 落盘前先审一眼草稿，技能库污染比没有技能库更糟。
- **合并重复，单一信源**：规则长大后会互相重叠，定期合并成总入口，
  旧文件直接删除（向后兼容靠 git 历史），不留双源分叉。
- **让 AI 自己提议沉淀**：复杂任务搞定后 AI 主动贴规则草稿，你一句话审
  （"落 / 不用 / 改一下"），半自动比纯手动可持续、比全自动质量高。

---

*附：完整目录清单可直接看 `~/.claude/rules/`（32 个文件名即目录），
本文档源文件在 `~/.claude/docs/claude-config-体系分享.md`。*



