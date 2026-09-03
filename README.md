# agent-config — 个人 Agent 操作系统

一套**跨 agent 复用**的个人配置体系：通用层（规则 / 技能 / 记忆）对所有 agent 生效，Claude Code 专属层（hooks / 子代理 / 斜杠命令）单独隔离。已在本机 ZCode、Claude Code、Codex 三个 agent 上实测共享。

> 前身是 `claude-config`（Claude Code 单绑定版），重构为「通用 + 适配」两层后开源。
> 本体系的核心方法论（Loop Engineering：改 → 量 → 留/弃 的自收敛循环工程）见 [docs/loop-engineering-practice.md](docs/loop-engineering-practice.md)。

---

## 结构

```
├── AGENTS.md            # 通用层权威源：常驻规则（所有 agent 可读）
├── CLAUDE.md            # Claude Code 桥接（@import 自动加载，仅 CC 需要）
├── rules/               # 规则手册：常驻规则 + 各语言/领域规范（按需 Read）
├── skills/              # 私有技能（SKILL.md 标准，跨 agent 格式）
├── projects/            # 项目记忆骨架（真实记忆不入库，见 .gitignore）
├── docs/                # 体系设计说明与指南
├── claude-code/         # ⬇️ Claude Code 专属层，其他 agent 不需要
│   ├── settings.json    #   hooks 注册（危险操作硬卡点等）
│   ├── scripts/hooks/   #   hook 脚本本体（danger-gate / 上下文退化守卫 / 会话快照）
│   ├── agents/          #   子代理定义
│   ├── commands/        #   斜杠命令
│   ├── ccline/ plugins/ workflows/ ecc-scripts/
│   └── statusline-command.sh
├── NEW-MACHINE-SETUP.md # 新机部署：通用层接任意 agent + CC 层还原
├── CONFIG_INDEX.md      # 当前装了什么的速览
└── make-public.sh       # 从 master 构建可公开快照（脱敏 + 排除隐私）
```

## 通用层接入任意 agent

| 接入点 | 做法 |
|---|---|
| 技能 | `skills/*` junction / 复制到 `~/.agents/skills/`（多数 agent 直读该目录）或各 agent 自己的 skills 目录 |
| 常驻规则 | 原生读 `AGENTS.md` 的 agent（Codex / Gemini CLI / opencode…）直接指向本文件；Claude Code 用根 `CLAUDE.md` @import 自动加载 |
| 记忆 | `projects/{项目}/memory/` 纯 markdown，任意 agent 可 Read |

三层都没有 agent 特有语法——这是与旧版 claude-config（单绑定 Claude Code）的本质区别。

## Claude Code 专属层

hooks 是本体系价值密度最高的部分：`danger-gate.mjs` 在 PreToolUse 硬阻断高危操作（DDL / 无 WHERE 批量 DML / 递归 rm，exit 2 当场拦下），`context-degradation-guard.mjs` 监控上下文退化，`session-snapshot.mjs` 会话续接。依赖 CC 的 hooks 机制，无法移植到其他 agent，故隔离在 `claude-code/` 下。

## 隐私边界（为什么仓库里没有真实配置数据）

- `projects/*/memory/` 真实工作记忆、简历草稿、API provider 清单**不入库**（`make-public.sh` 构建公开快照时排除）
- 公开快照中真实姓名统一替换为占位符（脚本自动化脱敏）
- 私有完整版保存在本地 master 分支，公开分支 `main` 是脱敏快照，可重复构建

## 部署

见 [NEW-MACHINE-SETUP.md](NEW-MACHINE-SETUP.md)：通用层三条命令接入任意 agent；Claude Code 层还原（hooks / 子代理 / 命令 / 状态栏 + 路径改写脚本）。

## License

[MIT](LICENSE)
