---
alwaysApply: false
description: "autoresearch 实战执行手册 — 蜂群+codex+狼群 多轮收敛的具体步骤、关键陷阱、收敛判断。按需触发：跑 autoresearch 前 Read 本文件，不常驻 context"
---

# autoresearch 实战执行手册

来源：HEMS module-telemetry MQTT 接入链路 6 轮收敛实战（2026-05-24，10 处真问题修复 + 测试 52→55 持续绿）。

本规则是 `workflow-routing.md` 第三节 autoresearch 触发的**执行细化**。触发判断仍由 `workflow-routing.md` 负责，本规则补"开跑后怎么走"的具体步骤。

## 单轮标准流程（5 阶段）

### 1. 审查阶段（并行）

- **蜂群 N 视角 fanout**：`security-reviewer` + `code-reviewer` + `architect-reviewer` 是黄金三视角组合（覆盖安全/正确性/架构三个互补维度）
- **codex review --uncommitted 独立异构二审**：与蜂群**真并行**起，不要串行等
- 每个 subagent prompt 必须：
  - 列出**精确的文件绝对路径**（不要让 subagent 自己 grep 找）
  - 提供**契约文件路径**作为参考（如 mqtt-schema.json）
  - 明确"严重度排序，最多 N 条，不要凑数"，否则会得到一堆 L 级噪音

### 2. 汇总阶段

- 去重：H 级在 ≥ 2 视角出现 = 强信号，必修
- **范围外发现**单独标记（如 codex 顺带扫到的 DDL P1，明确是范围外）
- 按修复性质分批：
  - **可一轮自动修**（边界检查、异常捕获、注入）→ 进狼群
  - **需架构决策**（分层、SRP、契约绑定）→ 出 ADR
  - **触发人工卡点**（DDL / 契约 / 金额）→ 停下报告

### 3. 修复阶段

- **单文件多 fix** → 主 agent 自己 Edit 处理（最快，无 spawn 开销）
- **2-4 个独立文件（< 5）** → **Agent fanout**（单 message 多 Agent 并行 with `subagent_type: general-purpose`）。**默认走这条**，反馈同步 100% 可靠
- **≥ 5 文件 / 跨模块 / 需 agent 间协作** → 命名 teammate 协作：`Agent(name=<成员名>, subagent_type: general-purpose)` 并行派多个，teammate 间用 `agent-message` 互通（**本 CC 版本无独立的建队/删队工具，agent 跑完即终止、无需显式删队；2026-06 实测确认**）。真正协作型才用，详见 `workflow-routing.md` 第二节狼群分级表
- **铁律**：任一实现下，同一文件不能被 2 个 agent 同时编辑

#### 3a. 大规模并行写才开 worktree 隔离（2026-06-27 补强）

**默认不开 worktree**——小规模 fanout（本文件主场景）边界划清后撞车风险本就为零，叠 worktree 是为不存在的风险付成本（违背 YAGNI）。以 **5 文件**为单一阈值二分，无中间死区：

- **≥ 5 文件 / 跨模块 / 边界难完全划清** → 开。此时纪律约束容易疏漏，用 worktree 物理隔离：`Agent(..., isolation: "worktree")`，每个 agent 独立 worktree，改完自动清理（未改动则自动移除）。Workflow 脚本同理 `agent(prompt, {isolation:'worktree'})`
- **< 5 文件且边界已划清的 fanout** → 不开，纪律铁律（同文件不双写）已够。与第二节狼群分级表对齐：< 5 文件走 fanout、≥ 5 文件走 Team
- **蜂群只读审查 / 单 agent 串行 / 不同仓库无共享文件** → 不开

**代价**：每个 worktree ~200-500ms 建 + 占磁盘，所以只在大规模并行 write 时值得。

**与铁律的关系**：worktree 防**物理写冲突**；但两个 agent 改不同 worktree 的同一文件，merge 时仍有**逻辑契约冲突**，这层仍靠任务边界划分避免。原铁律"同一文件不能被 2 个 agent 编辑"始终保留作兜底。

### 4. 验证阶段（两步不可省）

**4a. 先 `git diff` / `git status` 看实际改动** —— 不依赖 agent 自报，git 状态是真相
- 改动文件列表对得上 spawn 时分配的吗？
- 改动行数合理吗？（太少 = agent 偷懒；太多 = agent 越界）
- 关键 fix marker 命中吗？（grep 关键变量名 / 注解 / 常量）

**4b. 再跑测试** —— `./mvnw test -pl <module> -am`（**必须 -am**，否则缺兄弟模块 jar 直接 BUILD FAILURE）
- 测试增量 ≥ 0 且 fail/error == 0 才算 PASS
- **关键**：编译过 ≠ 通过，必须测试绿

**Why 4a 在 4b 前**：测试可能因 agent 完全没动而"全绿"（旧代码继续跑），git diff 是唯一判定 agent 真做事的客观信号。

### 5. 收敛判断

- 单轮全视角 0 H/M = 收敛信号
- 严格 metric：连续 2 轮 0 → 真收敛
- 实用主义豁免：1 轮全 0 + 测试持续绿 + 剩余只剩 nitpick → 可宣布收敛

### 5b. 判停硬闸：token 预算 + 收敛量化（2026-06-27 补强）

第 5 节的判停信号（连续 2 轮 0 / regression / ROI）解决了"什么时候算赢"，但缺两个兜底，补在这里。

**硬闸 1：token / 轮数预算上限（防闷头烧）**

收敛信号偶发失灵的场景：metric 死活不收敛，又没触发 regression（不是越改越坏，是原地震荡）。此时前面的判停条件都不命中，循环会一直跑。必须有硬上限兜底：

- 开跑前先估一个**轮数上限**，在复述确认协议里就报给用户（"max N 轮"）。默认值唯一定义在 `routing-core.md` 信号叠加表，此处不重复数字，避免双写漂移
- 跑到上限仍未收敛 → **强制停 + 报告**，把"已修 X / 剩余 Y / 为什么不收敛"摊开让用户拍板，**不擅自续命**
- 有 token 预算指令（如 "+500k"）时：以**前几轮实测均值**作为单轮成本估计（不靠凭空预估），余量 < 该均值 → 强制停。**首轮无均值则跳过 token 闸，仅受轮数闸约束；从第 2 轮起启用**。主判据始终是轮数上限，token 余量是附加闸
- **Why**：循环工程最隐蔽的失败不是改坏，是"在该停的地方不停"——没有硬闸，一个不收敛的 metric 能把预算烧干还交不出东西

**硬闸 2：收敛量化（治"够好了"拍脑袋）**

可量化的 metric（测试数 / fail 数 / P95 / 编译 exit / lint warnings）已经客观，直接用数值判停。

问题出在**审查类**收敛——"剩下只是 nitpick""ROI 低于代价"是定性判断，靠主观估容易飘。补一个半量化口径：

| 收敛维度 | 量化口径（满足才算收敛） |
|---|---|
| 测试 / 编译 / lint | 数值达标（fail=0 / exit 0 / warnings=0），无主观空间 |
| 多视角审查 | 连续 2 轮**全视角** H+M 级 finding 数 = 0（L 级不计入判停） |
| 性能 | 命中目标数值（如 P95 < 200ms），且连续 2 次测量稳定 |
| 审查"够好了" | 不靠感觉——列出本轮剩余 finding 的严重度分布（H/M/L 各几条），H+M=0 才宣布收敛，剩余 L 级单独列清单交付，不阻断 |

**Why**：把"够好了"从主观感觉降级成"H+M=0 + L 级清单"的客观陈述，既防过早收敛（漏 H/M），也防过度打磨（为清 L 级烧轮数）。

### 5c. 收敛账本：完成契约机器化（2026-06-27 补强，借鉴 omo ralph-loop）

**适用范围：仅 autoresearch 多轮循环。** 判据 = 是否走了第三节复述协议（有 goal/metric/max N 轮）；走了才是 autoresearch。单轮 fanout / 一次性任务 / 普通多次修改**不需要** verdict 行——别把它套到简单任务上制造无谓仪式（见 `user-profile.md` 反感的"弱智式确认"）。

第 5/5b 节定义了客观判停信号，但谁强制主 agent 在每个停点都按信号办？借鉴 omo ralph-loop 的核心哲学 **claims require evidence**（passive stop ≠ done），落地为一条强制收尾纪律，**不搞每轮固定模板的仪式**：

**autoresearch 每轮想停时，必须显式给出一行 verdict + 证据，否则不许结束：**

```
verdict: CONVERGED | HOLD | STOP   evidence: <按 metric 类型填，见下>
```

- **CONVERGED 必须有客观证据，按 metric 类型二分（与 5b 量化表对齐）**：
  - **数值类 metric**（编译 exit / 测试数 / P95 / lint warnings）→ evidence 填命中的数值，如 `exit=0` / `测试 55/0/0` / `P95=180ms`，达标即可，无 finding 概念
  - **审查类 metric**（多视角找问题）→ evidence 填 `finding H=0 M=0 L=_`，**H+M=0** 才算 CONVERGED
  - **混合型 metric**（如"测试绿 + 安全审查无 H/M"）→ evidence 必须**同时**列全部子条件且**全部满足**，缺一不许 CONVERGED
  - 缺客观证据不许写 CONVERGED——对应 omo `<promise>DONE</promise>`：显式声明 + 证据，而非"看起来完成了"
- **想停但不满足收敛 → 只能 HOLD（继续）或 STOP（触发 5b 硬闸→报告让用户拍板），不许默默结束对话当收敛**——这是 5c 唯一不可替代的约束（对应 omo Todo Enforcer 防偷停）
- 只在对话里写这一行，**不落盘**、不做 omo 的 `.omo/ulw-loop/` 持久化（本地场景不需要跨会话 resume，YAGNI）

**Why**：5/5b 是"判停信号"，5c 是"谁强制执行信号"。但只要一行 verdict+evidence 即可，把判定从主观叙述变成显式带证据的结论——不需要每轮贴 ASCII 大块（那是形式主义负担，会偷停的 agent 同样会糊弄模板）。

## 实测数据：Agent fanout vs Team mode（2026-05-24）

HEMS module-telemetry 同一类 fix 任务（多文件并行 write）的两次实测对照：

| 维度 | 旧路：命名 teammate 协作（Agent + team_name + agent-message） | 新路：纯 Agent fanout |
|---|---|---|
| **样本** | 5 个 teammate（Batch A 2 + Batch B 3） | 2 个 agent（L 级 fix 验证） |
| **反馈率**（agent 主动汇报） | **1/5 = 20%**（4 个静默 idle） | **2/2 = 100%**（同步返回工具结果） |
| **报告内容质量** | 收到的清晰，没收到的全靠主 agent 猜 | 都含 files + 改动点 + mvn 结果 + 意外发现 |
| **工具调用次数** | 建队 + 3 Agent + 3+ 轮 agent-message + 收尾 = **8+ 次** | 2 Agent + 1 git diff + 1 mvn test = **4 次** |
| **耗时** | ~10 分钟（含等 agent-message 协作与收尾） | ~3 分钟（agent 跑完即得） |
| **主 agent 心智负担** | 高（需追问、等待、补救） | 低（同步返回，逻辑直） |
| **autoresearch 多轮净收益** | — | **每轮省 5-7 分钟 × 4-6 轮 = 20-40 分钟 / 单次 autoresearch** |

**结论**：Agent fanout 在反馈可靠性、仪式开销、耗时三方面全面优于 Team mode。狼群默认走 Agent fanout 是实证而非推测。

## 8 个真实陷阱与对策

| 陷阱 | 对策 |
|---|---|
| **Team teammate 不自报状态**（即使 prompt 里要求，实测 ~80% 静默） | **首选**：狼群默认走 Agent fanout（`workflow-routing.md` 第二节），同步返回工具结果。**兜底**：用 Team 时仍主动 `git diff` + mvn 验证，git 状态是真相 |
| **命名 teammate 协作的 task list 与个人 task list 隔离** | 协作模式下 teammate 找不到 task #N 是正常的，不是 bug，是两套 list 切换 |
| **codex Windows sandbox 错误** | `codex_core: spawn setup refresh` 错误不阻断输出，仍可用 |
| **codex finding 颗粒度低**（只给标题不给 detail） | 用 `autonomous-judgment` 评估实际危害，false positive 不必照单全收 |
| **Spring `@ConfigurationProperties` 不 wire 就是死代码** | 必须配 `@EnableConfigurationProperties(X.class)` + 注入点显式拿。光定义 Properties 类不够 |
| **Bean 暴露默认类型（如 ObjectMapper）污染全局** | wrapper class 类型隔离（Spring < 6.2 没 `defaultCandidate = false`），如 `MqttObjectMapperHolder` |
| **MQTT/网络 callback 线程做重活** | 必须 ExecutorService 异步 + `try (Throwable)` 兜底，否则异常逃出 callback 行为未定义 |
| **`Executors.newFixedThreadPool` 无界队列** | 改用 `ThreadPoolExecutor` + bounded `LinkedBlockingQueue` + `AbortPolicy` + `RejectedExecutionException` 捕获形成显式背压 |

## Agent spawn prompt 模板（无论 fanout 还是 Team mode 通用）

每个 spawn 出去的 agent prompt 都应该包含：

```
## 唯一目标文件
<绝对路径>

如有需要可新建 <package> 下的配置类，但**不要**改 <other-files-list>（已分配给其他 agent）。

## 任务
<具体 fix 描述，带具体函数/字段/行号引用>

## 验证步骤（你必须做）
1. cd <repo> && ./mvnw compile -pl <module> -am -DskipTests
2. cd <repo> && ./mvnw test -pl <module> -am

## 报告格式（最后必做）
完成后用一段文字汇报：
- 改了哪些文件（绝对路径）
- 关键修改点（几行代码或类名）
- mvn compile / test 状态
- 任何意外发现

**不要废话，重点是改完跑通**。
```

如果用 Team mode（协作型场景），额外加：

```
## 强制汇报协议（命名 teammate 协作特有）
完成最后一个工具调用后，**同一轮必须以一条 agent-message 收尾**（发给 team-lead）：

<agent-message to="team-lead">
DONE
files: <...>
compile: PASS
test: N/M/K
notes: <...>
</agent-message>

idle 不是完成信号 — agent-message 才是。（注：本 CC 版本用 `agent-message` 通信，非独立的发消息工具，2026-06 实测确认）
```

即使这样，Team mode 报告率仍只 ~60%，故 4a 验证不可省。

## 何时停止循环

- 连续 2 轮真 0 finding → 收敛 ✅
- 用户喊停 → 立即停 ✅
- 剩余 finding 都是 nitpick (L 级) → 收敛 ✅
- 修复 ROI 低于代价 → 报告 + 收敛（让用户决定是否单独处理）
- 修复引入新问题（regression）连续 ≥ 2 轮 → 暂停 + 报告，避免无限震荡
- **轮数 / token 预算到顶 → 强制停（判停硬闸，详见 5b）**；判停的机器化执行见 5c 收敛账本

## 与人工卡点的边界

autoresearch **不能擅自跑过**（即使代码层可修）：
- DDL / 批量 DML（`human-gate.md` 卡点 2 生产变更）
- contracts/* 改动（卡点 3 跨仓库契约）
- 业务对账 / 金额（卡点 1）

发现这些必须停下，列影响范围给用户。本轮 autoresearch 内不修，单独走卡点流程。

## 典型一轮的工具调用清单（2026-05-24 修订）

参考实战示例（每轮约 3-10 分钟）：

```
1. Bash: git status + 列文件 → 锁定 scope
2. 并行（一个 message 里同时发）:
   - Agent (security-reviewer)
   - Agent (code-reviewer)
   - Agent (architect-reviewer)
   - Bash: codex review --uncommitted （可后台跑）
3. 汇总 finding（我自己合并去重，不派 subagent）
4. 修复 — 按规模选实现:
   a) < 5 文件 / 无协作 → 并行 Agent fanout(subagent_type:general-purpose) × N
   b) ≥ 5 文件 / 协作型 → 命名 teammate：`Agent(name=<成员名>, subagent_type: general-purpose)` 并行 + teammate 间 `agent-message` 协作（无独立建队/删队工具，agent 跑完即止）
5. Bash: git diff → 验证 agent 真做了事（关键，不可省）
6. Bash: mvn test -pl <module> -am
7. (如有失败) Bash: 定位 + Edit 修
8. 重复 1-7 直到收敛
```

## Why（顶层）

autoresearch 的核心价值不是"全自动"，而是"在该停的地方停 + 在能跑的地方跑"。蜂群+codex 异构二审是为了避免单视角盲区；狼群+循环是为了把修复成本降到边际；测试持续绿是收敛的客观信号。**任一环节缺失（如 teammate 不验证、codex 不审、测试不跑）autoresearch 就会退化成普通修 bug**，失去多视角组合优势。

---

## 6 脚本化强制执行路径（确定性 loop）

第 1-5c 节是写给模型读的**散文纪律**——会偷停、会糊弄 verdict。对**可量化、可参数化**的 autoresearch
循环，优先走脚本化路径：`~/.claude/workflows/autoresearch-loop.mjs`（Workflow 工具，`Workflow({name:'autoresearch-loop', args:{...}})`）。

**边界（务必清楚，两层保证）**：Workflow 脚本只能经 `agent()` 跑命令，无直接 shell 原语，也无法在
并行写主树时做「逐 agent 改了哪些文件」的归属。所以保证分两层：
1. **控制流确定性**——循环/计数/判停/卡点/预算/钳制，模型无法绕过。
2. **证据与写入：事后确定性检测，检测到即拒绝收敛/STOP**——`evidenceConsistent`（哨兵行精确比对 testStat）、
   每轮新增改动越界检测、敏感路径门禁；能**发现并拒绝**越界与糊弄，但**不能物理阻止** fix agent 写错文件。
   要物理阻止须 worktree+逐文件 allowlist merge（Workflow 暂不支持）或 `serialFix`（仍是事后检测）。
这是工具天花板，非缺陷，已在脚本头显式声明。

它把本规则的纪律变成控制流 + 事后强制检测：

| 散文纪律（1-5c 节） | 脚本强制点（控制流，非自报） |
|---|---|
| 5 阶段单轮流程 | `Baseline → Review → Fix → Verify → Judge` 固定 phase |
| 4a git diff 先于 4b 测试 | `runVerify` prompt 用编号步骤 `1.先 git diff / 2.再测试` 强制顺序；`VERIFY_SCHEMA` 把关键字段（含 `testPass/testTotal/testStat`）设为 **required**，缺失即判不可信（防回退/校验静默失效） |
| 基线强制 | 进循环前先 `runVerify('baseline')` 取测试基线 + 已有改动快照；**基线 null 或证据不一致直接 STOP**，拒绝在不可信基线上迭代（不回落假绿） |
| 5/5b 收敛 + 轮数硬闸 | `while (round < maxRounds && cleanRounds < minClean)`，maxRounds 钳到 `[1,8]`，默认值见 `routing-core.md` |
| 5b token 预算闸 | 三处查：启动/首轮按 `地板×(视角数+2)`；轮间取 `max(地板, 滚动均值)`；**Fix 前投影** `(组数+1)×地板`，覆盖不了本轮所有修复+验证就当轮 STOP（防无界 fanout 超支） |
| 5c verdict 账本 | 每轮 push `{verdict, evidence}`；`CONVERGED` 必须同时满足 H+M=0 + 不回退 + 全视角到齐 + 无越界 + 证据可信 |
| 防假收敛（reviewer 集体挂）| 视角不全（`responded < perspectives`）记 `INCONCLUSIVE`，**不计入且重置** cleanRounds（保「连续」语义）；连续 2 轮则 STOP；空 `perspectives` 数组回落默认三视角，杜绝 0===0 假收敛 |
| 防假收敛（L 盖 H/M）| `dedup` key=`file+标题前缀+line`（**不含 severity**，跨视角同问题归一），碰撞保留**最高 severity** 且合并 detail；H/M **全量不截断**（`hm` 直接来自去重结果），L 仅计数展示，故 H/M 永不被丢 |
| 防红着 / 带回退收敛 | 每轮跑 `runVerify`；`clean` 用 **`!regressed`**（与 metric「不回退」一致，不要求绝对绿，兼容基线本就红）；回退=绿→红 / 通过数较**基线**下降 / 总用例数下降（抓删测试）/ 通过数较**上一可信轮**下降（抓高于基线的来回倒退）；`verify` null 直接 STOP |
| 防证据糊弄 | evidence 必含**锚定整行** `^TEST_STAT: (N/A\|p/f/e)$`，解析三元组后**交叉验** `testPass===p`、`testTotal===p+f+e`、`testGreen 时 f=e=0`；testStat 不可空；**配了 testCmd 却报 N/A 直接判不可信**（防跳测试）；changedStat 数量须**精确等于** diffFiles（门禁靠它完整性，不容缺漏）；不一致/归属不符/自报 changed 但 `diffFiles=0` → 不计收敛 |
| 人工卡点（human-gate）| ① reviewer 侧：`isGated(f)` = `GATE_ASCII`(带`\b`) ∪ `GATE_CJK`(不带`\b`) ∪ **`GATE_PATH`(对 finding.file)**，命中即整 loop **立即 STOP** 交人工（不累积/不续跑）② fix 写入侧：本轮指纹变化的文件命中 `GATE_PATH`（DDL/迁移/`.sql`/flyway/liquibase）即 STOP（拦 fix agent 越权写，不止拦 reviewer finding）；偏保守 |
| 防 reviewer 偷懒 | review prompt 要求先跑 `git status/diff`，`reviewedFiles` 列实际审过文件；基线有改动却 `reviewedFiles` 空 → 该视角不算有效响应（→ quorum 不足 → INCONCLUSIVE），杜绝「空 findings 假装审过」 |
| 越界写检测（**检测非阻止**）| **诚实**：脚本**不能物理阻止** fix 写错文件，只能事后检测。机制：`git diff --numstat` 取每文件 ±行数指纹，遍历 `prev∪cur` 全路径，指纹变化（含新增/消失/同名改写）即「本轮触动」；触动且**不在当轮分配集** → 越界 → 本轮不计收敛 **且不滚动 `prevStat` 基准** → 该越界文件**每轮被 re-flag**，故**永远无法假收敛**（这是可保证的安全属性）。**未跟踪新增文件**（`git diff --numstat` 不含）经 `untracked` 字段单列、以哨兵指纹并入触动集，故新建 `.sql`/migration 也逃不过越界/敏感门禁。路径 `normPath` 归一并默认**大小写不敏感**（win32/mac 防 `Foo.ts`/`foo.ts` 误判两文件，`caseSensitivePaths:true` 可关）。**已知盲区**：分配集内两 agent 互改对方文件（同集串写）检测不到——需 `serialFix` 降竞争或 worktree+merge 物理隔离（Workflow 暂不支持） |
| verify/review/fix agent 可能返回 null | 全部 `filter(Boolean)`；verify 为 null 直接 STOP（绝不当收敛） |

> **为何默认不开 worktree（不夸大）**：fix 走 in-place file-disjoint fanout。这**不能物理保证**无写冲突——
> 它靠 prompt 约束 + 事后指纹检测（越界即永不收敛）。真正物理隔离需 worktree，但 worktree 改动落在各自
> 工作树、不进主树，而 verify 在主树跑 `git diff`/测试会看不到修复 → 永不收敛；要用 worktree 必须先补
> 「逐 worktree 按 allowlist merge 回主树」再验证（Workflow 暂不支持，见 rule 3a）。`serialFix:true` 可串行修以
> 降低并发竞争窗口，但仍是事后检测而非物理阻止。**这层是工具天花板，文档据实说明，不声称已强制。**

**何时走脚本 vs 散文**：
- 可量化 metric + 可参数化仓库/测试命令 + 想要不可糊弄的硬闸 → **脚本**
- 探索性 / 一次性 / metric 模糊 / 需要中途人工判断方向 → **散文**（主 agent 自己按 1-5c 跑）

**入参**：`{repo, testCmd, buildCmd, scope, goal, metric, maxRounds, minCleanRounds, perRoundTokenFloor, perspectives, serialFix}`，
全部有默认值且非法值有钳制；不传 testCmd/buildCmd 则退化为「仅 git diff」验证；`serialFix:true` 串行修以降并发竞争。

**仍受人工卡点约束**：脚本命中 DDL/契约/金额类 finding 时**立即 STOP 整个 loop**、列清单交用户（高于一切自动编排，见 `human-gate.md`）。处理完后由用户用更精确的 `scope` 排除已 ack 的文件再重跑。

### 6.1 CLI 无关的可移植版：`~/.claude/scripts/autoresearch-loop.sh`

同一套纪律的 **shell 实现**，后端可插拔（`--backend codex|claude|opencode|ollama|gemini`），脱离 Claude Workflow 运行时，可丢进任何装了某个 agent CLI 的机器跑。依赖仅 `bash + git + node`（JSON 全走 node，不依赖 jq）。

与 `.mjs` 版的关键差异——**证据由脚本自采**：`git --numstat` 与测试命令由 shell 直接跑，不靠 agent 自报。这从根上消除了 Workflow 版的两个工具天花板（「证据 agent 采集」「越界只能检测不能算准」），shell 版的 verify/越界检测是脚本一手数据。

```bash
~/.claude/scripts/autoresearch-loop.sh --repo <path> \
  --test-cmd './mvnw test -pl m -am' --backend codex --max-rounds 6
```

**codex 后端的蜂群/狼群（codex 0.115+ 原生角色，2026-07 适配）**：codex CLI 已 GA 子代理，三角色 explorer(只读)/worker(读写)/default，最多 6 并发。本脚本把 **蜂群 review 映射到 `codex exec -s read-only`**（explorer，沙箱物理禁写，比 prompt「只读」更硬）、**狼群 fix 映射到 `codex exec -s workspace-write`**（worker，可写）；`--full-auto` 在 codex 0.144 已从 help 隐藏/弃用（仍被接受但不推荐），故改 `-s` 显式选角色。**并行仍由 shell fanout 编排**（多个 run_agent 并发 = 蜂群/狼群），**不**用 codex 内建 `multi_agent` 委派——循环/计数/判停/预算/人工卡点这些硬闸必须确定性掌控，交给 codex 自主委派＝把非确定 LLM 放进控制流、破坏「永不假收敛」。**平台可靠性（实测 0.144.1）**：codex 纯文本 exec 在 Win/Linux/mac 都稳，read-only 能跑 git 读、workspace-write 能写；但 codex 跑 shell 子进程（git/pwsh）在**原生 Windows 上会 stall**（"timeout waiting for child process to exit"）→ codex 后端**建议在 WSL/Linux/mac 跑**。`--backend-timeout`（默认 600s，需 coreutils timeout）兜底：挂死后端到点被 kill→该轮 INCONCLUSIVE，绝不 deadlock 整个 loop。定位：**codex 当 worker（在正确角色沙箱跑），shell 当确定性大脑**。

> 精确边界（codex 复审 L2/L3 收窄）：`-s workspace-write` 只给 worker **文件系统写权限**，**不**替脚本 enforce「只改分配文件」——per-file soundness 仍来自 shell 侧 serial-fix / 快照+指纹检测，非 codex 角色。`--backend-timeout` 依赖 coreutils `timeout`（Linux/WSL/git-bash 自带；**mac 需 `brew install coreutils`**，否则探测失败→不设超时并告警）；超时用 `timeout -k` 硬杀（TERM 无效则 10s 后 SIGKILL），且超时(rc=124/137)**丢弃半截 stdout 强制 INCONCLUSIVE**（不把部分输出误当有效结果）。「最多 6 并发」是 codex 自身上限，本脚本并发数由 `--perspectives`/分文件数决定。

三层关系：**L1 纪律**（散文，本文件 1-5c）通用；**L2 `.mjs`**（绑 Workflow 运行时，进程内 agent，有 token 账本）；**L3 `.sh`**（绑任意 CLI，证据自采，硬闸用调用次数代 token）。要 Claude 进程内编排走 `.mjs`，要跨 CLI / 异构后端 / 证据强保证走 `.sh`。

### 6.2 L2/L3 能力对齐现状（2026-07-03 审计后）

经异构评审（Fable5 + codex GPT-5.5 + Claude reviewer）+ 修复，L2 `.mjs` 已补齐原先相对 L3 `.sh` 缺失的防线，两版当前**语义基本对齐**：

| 防线 | L2 mjs | L3 sh | 说明 |
|---|---|---|---|
| human-gate 预扫（先于 quorum、全 severity、含无效视角） | ✅（已补） | ✅ | 防视角掉线/标 L 绕过卡点 |
| quorum 有效性 = reviewedFiles∩改动集 | ✅（已补） | ✅ | 防伪造 reviewedFiles 假收敛 |
| COVGAP 每文件×每视角覆盖 | ✅（已补） | ✅ | 防各扫一部分的假全覆盖 |
| 越界指纹 = 内容哈希 | ✅（agent 报 git hash-object，回落 numstat） | ✅（脚本自采 hash-object） | 测出同增删行数的原地改写 |
| repo≠'.' 归属剥前缀 | ✅（已修，原为静默锁死 bug） | ✅ | — |
| review 只读 | prompt 强制 + Verify 越界兜底 | pre/post 快照显式 STOP | sh 更早拦，mjs 等价但晚一步 |
| 证据来源 | **agent 自采**（哨兵+交叉校验兜底） | **脚本自采**（一手数据，更硬） | 这是 L2/L3 的**根本**差异，未变 |
| serialFix 默认 | false（并行快；无 shell 原语给不了 sound 归属） | true（逐文件快照真归属） | 默认相反，已在两处代码注释说明 |

**结论**：要**证据强保证 / sound 越界归属**仍走 `.sh`（脚本自采是天花板差异，L2 补不齐）；要 **Claude 进程内编排 + token 账本**走 `.mjs`（现已无原先的假收敛/绕卡点/锁死缺陷）。

### 6.3 平台变更适配（2026-07 CC 2.1.196–2.1.205）

最新 Claude Code 对「子代理错误」与「长任务韧性」的行为有变，loop 已同步适配：

- **子代理错误现在上报父级（2.1.199）**：subagent 命中用量上限/服务端错误/被限流截断，旧版会静默吞成假成功或 null，**新版把错误上报父级** → Workflow 里体现为 `agent()` 可能 **throw**。若不兜底，一次 review/fix/verify 抛错会在 `parallel()`/`await` 里**炸掉整个 loop、丢 history/verdict**。
  - **`.mjs` 已加 `safeAgent` 包裹**所有 `agent()` 调用：throw 降级为 null，复用既有 fail-closed 路径（review→视角掉线不计 quorum→INCONCLUSIVE 绝不当收敛；verify→STOP；fix→该问题留下轮重审）。纯抗崩溃，判停语义不变。
  - **`.sh` 无需改**：外部 CLI 后端（codex/claude/opencode）失败是非零退出/空 stdout，`ask_json` 本就重试 2× 且证据脚本自采——早已对同一失败模式免疫。这也反证「证据自采」是 L3 更硬的根因。
- **长循环韧性开关（2.1.196）**：loop 最多 8 轮 × 多 agent，单次流很长。平台默认已开 streaming idle watchdog（5 分钟无事件即中止重试，`CLAUDE_ENABLE_STREAM_WATCHDOG=0` 关）；瞬时错误重试上限提到 300（`CLAUDE_CODE_RETRY_WATCHDOG`）。跑长 loop 前确认这两项未被环境关掉，可显著降低"中途一次抖动毁全程"。
