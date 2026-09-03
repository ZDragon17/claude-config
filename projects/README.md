# projects/ — 项目记忆（骨架）

Claude Code 按 `~/.claude/projects/{项目路径转码}/memory/` 组织项目级记忆；本目录只保留**目录骨架与模板**，真实工作记忆因含业务细节**不入库**（构建公开快照时由 `make-public.sh` 排除，私有 master 分支本地跟踪）。

## 约定

- 每个项目一个 `MEMORY.md` 索引 + 按主题拆分的 `project_*.md`
- 只沉淀跨会话复用的经验：架构决策、踩坑、红线，不记流水账
- 敏感信息（密钥、内网地址、客户名）永不写入

## 新项目模板

```
projects/{项目名}/memory/
├── MEMORY.md          # 索引：一段话项目背景 + 分主题链接
└── project_*.md       # 按主题的记忆文件
```
