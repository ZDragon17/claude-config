# 新电脑还原指南

> 本仓库自两层重构起**不再直接 clone 成 `~/.claude`**：仓库根是 agent 无关的通用层（`AGENTS.md` / `rules/` / `skills/` / `projects/`），Claude Code 专属层在 `claude-code/` 下。
> 部署 = 把两层各自接到目标位置，再用脚本改写机器特定路径。
> 有三样东西被 gitignore 故意排除（机器特定 / 敏感 / 体积大），需按下面步骤补齐。

---

## 〇、通用层接入任意 agent（Claude Code 以外）

```bash
# 1) 技能：junction（Windows）或复制到共享技能目录，所有支持 SKILL.md 的 agent 即可见
cmd /c mklink /J "%USERPROFILE%\.agents\skills\ultrawork" "<仓库路径>\skills\ultrawork"
#    或逐个复制：cp -r skills/* ~/.agents/skills/

# 2) 常驻规则：原生读 AGENTS.md 的 agent（Codex / Gemini CLI / opencode…）
#    指向本仓库的 AGENTS.md，例如 Codex（~/.codex/AGENTS.md）写一行：
#      @参见 /path/to/agent-config/AGENTS.md   （或直接复制全文）
# 3) Claude Code 自身：根目录 CLAUDE.md 已是桥接文件，随第 1 步复制层一起进 ~/.claude 即可
```

---

## 一、为什么 clone 不够（三个缺口）

| # | 缺口 | 影响 | 补救 |
| --- | --- | --- | --- |
| 1 | **`claude-code/settings.json` 硬编码了原机器用户名路径** | hook（建议提示 / 会话快照 / 控制台扫描）+ statusLine 全部静默失效 | 部署后跑还原脚本（步骤 2） |
| 2 | **`~/.claude.json` 不在本仓库**（它在 home 根目录，git 管不到） | MCP 服务器（chrome-devtools / dbx）丢失、需重新登录、项目历史丢失 | 重新登录 + 重配 MCP（步骤 3、5） |
| 3 | **插件被 gitignore 排除**（installed_plugins.json + cache/marketplaces/data） | autoresearch / codex / understand-anything 等 skill 不可用 | 重装插件（步骤 4） |

**clone 下来直接就有的**（这部分无需操作）：`AGENTS.md` 全局规则、`claude-code/agents/`、`skills/` 自定义 skill、`projects/*/memory/` 经验骨架、`claude-code/scripts/` hook 脚本本体、各种 CLAUDE 配置文档。这些是配置的「大脑」，clone 即齐。

---

## 二、一键还原（推荐）

clone 本仓库后，只需复制 + 一条命令 + 一次登录：

```bash
git clone https://github.com/ZDragon17/claude-config.git
cd claude-config
# 1) 组装 ~/.claude：CC 专属层 + 桥接 + 通用层
mkdir -p ~/.claude
cp -r claude-code/. ~/.claude/
cp CLAUDE.md AGENTS.md ~/.claude/
cp -r rules skills projects ~/.claude/
# 2) 自动：改路径 + 装插件 + 配 MCP（幂等，可反复跑）
cd ~/.claude && node scripts/bootstrap.mjs
# 3) 唯一需人工：OAuth 浏览器授权，脚本无法代劳
claude login
```

`bootstrap.mjs` 自动完成下面「三、手动分步」里除登录外的所有步骤（改路径 / 装插件 / 配 MCP），且幂等——已完成的自动跳过。只有它报告某步失败时，才需翻到对应小节手动排查。

> 注意：`git clone` 本身无法触发自动执行（git 没有 clone hook，是安全设计），所以必须 clone 后手动跑一次 `bootstrap.mjs`。这已是能做到的最自动化形式。

---

## 三、手动分步（备用 / 排查用）

### 步骤 1：组装 `~/.claude`

```bash
git clone https://github.com/ZDragon17/claude-config.git
cd claude-config
mkdir -p ~/.claude
cp -r claude-code/. ~/.claude/
cp CLAUDE.md AGENTS.md ~/.claude/
cp -r rules skills projects ~/.claude/
```

### 步骤 2：改写硬编码路径（关键，否则 hook 全失效）

```bash
cd ~/.claude
node scripts/setup-new-machine.mjs
```

该脚本会：
- 从 settings.json 推断旧机器路径，替换为当前机器真实家目录
- 写 `settings.json.bak` 备份
- 命中 0 处（路径已正确）时自动跳过 —— 可重复执行，幂等
- 覆盖 Windows `.claude` 反斜杠 hook、Orca `.orca/agent-hooks` 正斜杠 hook、env 家目录三类；同 OS（Win→Win / mac→mac / linux→linux）全自动
- **跨 OS 迁移（Win↔mac/linux）会 fail-fast 报错退出（exit 2）、不改文件** —— 分隔符/盘符差异无法仅靠改 home 修复（会产出混合分隔符坏路径），需在新机重新生成 hook/statusLine 段

> **为什么用脚本而不是变量占位符**：全局 `~/.claude/settings.json` 的 hook command 没有官方可移植占位符（`${CLAUDE_PROJECT_DIR}` 指项目目录，不是 .claude），且 `$HOME`/`$USERPROFILE` 在 Windows 下 Git Bash(MSYS 路径) vs PowerShell 展开行为不一致，强行用会导致 hook 静默失效。运行时保持确定的绝对路径、仅部署时改写一次 = 零运行时风险。

### 步骤 3：重新登录

```bash
claude login
```

补回被 gitignore 的 `.credentials.json`（凭据绝不入库）。

### 步骤 4：重装插件

参见 `docs/install-plugins.md`。核心是这几个 marketplace 已记录在 settings.json 的 `extraKnownMarketplaces`：

- `autoresearch@autoresearch`（uditgoenka/autoresearch）
- `codex@openai-codex`（openai/codex-plugin-cc）
- `understand-anything@understand-anything`（Lum1104/Understand-Anything）
- `karpathy-skills`（forrestchang/andrej-karpathy-skills）

```bash
# 在 Claude Code 内执行（示意，以实际插件命令为准）
/plugin marketplace add <repo>
/plugin install <name>
```

> **注意：两个「codex」别混** —— `codex@openai-codex` 是 Claude Code 的 **codex 斜杠命令插件**（提供 `/codex:*` 斜杠命令），**不等于** `autoresearch-loop.sh --backend codex` 依赖的 `@openai/codex` **npm CLI**（PATH 里的 `codex` 可执行文件）。后者由 `bootstrap.mjs` 第 5 步幂等自动安装；用法与登录见步骤 7。

### 步骤 5：重配 MCP 服务器

MCP 配置存在 `~/.claude.json`（home 根目录），**不随本仓库同步**，需手动重建：

- **chrome-devtools** —— 前端真实联调用（navigate / click / screenshot / console / network）
- **dbx** —— 数据库查询

```bash
# 示意，以实际 MCP server 安装命令为准
claude mcp add chrome-devtools ...
claude mcp add dbx ...
```

### 步骤 6：补本地偏好（可选）

如原机器有 `settings.local.json` / `mode.json`（机器级私有配置，被 gitignore），按需手工补回。

### 步骤 7：codex loop 后端（可选，用 `autoresearch-loop.sh --backend codex` 时才需要）

> **两个 codex 不是一回事**：步骤 4 的 `codex@openai-codex` 是 **斜杠命令插件**（`/codex:*`）；`--backend codex` 要的是 `@openai/codex` **npm CLI**（PATH 里的 `codex`，脚本用 `command -v codex` fail-fast）。`bootstrap.mjs` 第 5 步现已幂等自动装这个 CLI，故下面第 1 步通常已完成、仅作兜底；但 **`codex login` 登录与 `loop-codex-test.sh` 验证无法自动化，仍需手动**。

```bash
npm i -g @openai/codex                              # 1) 装 codex loop 后端 CLI（bootstrap 第 5 步通常已自动装，此处为兜底/校验）
codex login                                          # 2) 登录（浏览器 OAuth；或 codex login --device-auth 走设备码）
bash ~/.claude/scripts/loop-codex-test.sh            # 3) 验证 codex 后端本机可用（PONG 冒烟 + 平台沙箱自适应；全绿即可用）
LOOP_CODEX_E2E=1 bash ~/.claude/scripts/loop-codex-test.sh   # 4)（可选）造 fixture 真跑一轮完整 loop，耗额度、约数分钟
```

> **原生 Windows 注意**：codex 的 elevated 沙箱跑 shell 子进程会 stall，`autoresearch-loop.sh` 已自动对 Windows 走 `--dangerously-bypass-approvals-and-sandbox`（安全靠 loop 的 git 指纹越界检测 + human-gate，非 codex 沙箱）。想要 codex 沙箱级读写隔离请在 **WSL/Linux/mac** 跑；`--backend-timeout`（默认 600s，需 coreutils timeout）保证挂死后端不 deadlock 整个 loop。

> **macOS 注意（`--backend-timeout` 超时守卫）**：`autoresearch-loop.sh` 用 `timeout -k` 硬杀挂死的后端，并**同时探测 `timeout` 与 `gtimeout`**（`brew install coreutils` 装的是带 `g` 前缀的 `gtimeout`）——两者任一可用即生效，**只有都不存在**才静默不套超时。stock macOS 只需 `brew install coreutils`（脚本会自动识别 `gtimeout`）即可。若你更希望 `timeout` 这个名字本身可用（可选），把 coreutils 的 gnubin 目录加进 PATH：
>
> ```bash
> brew install coreutils
> export PATH="$(brew --prefix)/opt/coreutils/libexec/gnubin:$PATH"   # 写进 ~/.zshrc 持久化
> command -v timeout && timeout --version | head -1                    # 应显示 GNU coreutils
> ```
>
> 装了 coreutils（提供 `gtimeout`）脚本即自动探测到并生效；上面把 gnubin 加进 PATH 只是让 `timeout` 名字本身直接可用，属可选。仅当 `timeout` 与 `gtimeout` 都不存在时才会无超时守卫。

---

## 三、验证清单

还原后逐项确认：

- [ ] **hook 生效**：随便跑个工具，PostToolUse 建议提示出现
- [ ] **statusLine 显示正常**：底部状态栏有内容（非报错）
- [ ] **会话快照生成**：SessionStart 时读到 `.claude/session-snapshot.md`
- [ ] **MCP 可用**：`chrome-devtools` / `dbx` 工具能调用
- [ ] **插件 skill 可用**：`/autoresearch`、`/codex:*` 等能触发
- [ ] **codex 后端可用**（可选）：`bash scripts/loop-codex-test.sh` 全绿（PONG 冒烟通过）
- [ ] **登录态正常**：能正常发起对话
- [ ] **规则加载**：`rules/` 下全局规则生效（如中文回复、人工卡点）

---

## 四、维护提醒

- **新增 hook 脚本**后，settings.json 里引用仍是绝对路径 —— 提交即可，新机器跑步骤 2 自动适配
- **新装 MCP / 插件**后，记得更新本文档步骤 4/5 的清单，保持单一信源
- `~/.claude.json` 体积大且含登录态，**永远不要**纳入仓库
