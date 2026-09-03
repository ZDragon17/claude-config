---
description: 自跑 orchestrator——把一个(可模糊的)需求交给 codex 自主落地:沙箱生成 + 异构复审 + 绝对门 + 人工闸
argument-hint: "[模糊需求，如：一个离线待办核心 / 用户登录+RBAC 模块]"
---

把下面这个(可能模糊的)需求交给**自跑 orchestrator** 落地,而不是自己手写:

**需求:$ARGUMENTS**

执行步骤:
1. 选一个干净目标目录(如 `./ulw-<短名>`)。
2. (可选但推荐,启用防篡改)先设一次性控制面密钥:`export KB_ORCH_TOKEN=<随机串>`(worker 子进程会被剥离它 → 无法自我批准/篡改状态)。
3. **后台**运行:`node ~/.claude/skills/ultrawork/orchestrator.mjs "$ARGUMENTS" <目录>`
   - 默认:codex `-s workspace-write` 沙箱生成(写约束在 cwd)+ claude 异构复审 + 绝对门 G1-G4 + 复审连续 2 轮 0 H/M(fail-closed)。
   - 它会一路自跑,**到下一个未批的人工闸(闸①架构确认 / 闸②推送)就停机**(exit 10)。
4. 到闸停时:读该阶段产出的工件(spec/design/plan/tasks/analyze 或收敛摘要)**给用户审**,逐条过支线/风险,不要一句话糊弄。
5. 用户说"放行 gateN"后:`node ~/.claude/skills/ultrawork/orchestrator.mjs --approve gateN <目录>` → 重跑同一命令续跑(状态可恢复,取消/崩溃零丢失)。
6. 需求命中金额/DDL/契约/统计等**卡点关键词会强制停**,不自动跨越——照 human-gate 出对账/diff 等用户拍板。

判定口径(不可放宽):编译过 ≠ 完成;以**真实测试绿 + 异构复审 0 H/M + 绝对门通过**为准;闸①/闸② 必须人工放行。

> 轻量场景(个人工具、你在旁边看、不涉钱/生产库)其实**直接开 codex 终端打需求**更快;`/land` 是给"要保证 + 放手不看 + 涉安全/合规/多模块"的场景用的。
