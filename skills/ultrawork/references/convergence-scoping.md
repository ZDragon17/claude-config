# Convergence Scoping —— loop 作为每层收敛内核（Stage 4–7）

核心：**autoresearch-loop 是收敛原语，不重写；ultrawork 在每个产码检查点调用它，`--scope` 逐层放大。** 引擎（`autoresearch-loop.mjs/.sh`）+ human-gate + verify-config **复用同一份、不分叉**——本次升级**仅把默认 perspective agentType 调成 general-purpose**（config，非收敛逻辑），其余引擎行为未改。

## 两种接入模式（CLI 后端可用 → 优先 B；否则降级 A）

### B. Subprocess 级（真·引擎，CLI 后端可用时**默认用这个**）
真正调用 autoresearch-loop 程序，带齐引擎独有的机械保证：内容哈希指纹越界检测、isGated 机器门禁、确定性 min-clean 轮数、全视角到齐 quorum fail-closed。
```bash
bash ~/.claude/scripts/autoresearch-loop.sh \
  --repo . --scope "<本层描述>" \
  --backend codex --perspectives security,correct,arch \
  --test-cmd '<本层测试命令>' --max-rounds 6 --min-clean 2
```
codex 后端沙箱按平台自适应（原生 Windows→bypass；Linux/mac/WSL→角色沙箱）。

### A. Prose 级（**降级**：无 CLI 后端时主 agent 手工复演）
⚠️ **诚实警告**：prose 是降级模式——主 agent 手工复演，**没有**引擎的指纹越界检测 / isGated 机器门禁 / 确定性轮数与 quorum，"无越界 / 连续 N 轮"靠主 agent 自律，**假收敛/漏 gate 风险回升**。能用 B 就别用 A。
1. **蜂群 review**：派 N 个只读 agent（`general-purpose`/`task`，lens=security/correct/arch），scoped 本层文件，输出 findings。
2. **异构二审（按需，见 codex-review-policy；终局强制）**：codex 复审同一 diff（`codex exec -c notify='[]' -s read-only --skip-git-repo-check -`，**不加 env -u**）。
3. **汇总去重 + 人工卡点预扫**（命中 human-gate → STOP 交人工）。
4. **狼群 fix**：按文件无冲突分配修 H/M。
5. **verify**：跑该层 test-cmd（Level 对应 real-e2e）+ **指纹替代**（`git diff --stat` 边界核对 + 越界文件清单，让"无越界"可核而非自报）。
6. **判停**：连续 N 轮 H+M=0 且不回退且无越界 → 收敛；否则回 1。

## `--scope` 分层（对齐 tasks.md 收敛层）

| 层 | scope | test-cmd | 视角 |
|---|---|---|---|
| 单点（trivial/fix） | 改动文件集 | 该点测试 | correct（+security 若涉输入/鉴权）；min-clean=1、蜂群缩到 1–2 视角（轻任务省 loop 成本） |
| 功能 | 单功能改动文件集 | 该功能的功能测试 | correct（+ security 若涉输入/鉴权） |
| 模块 | 模块目录 | 模块集成测试 + 其下功能测试 | security,correct,arch |
| 系统 | 整仓库 | 系统集成 + 真 E2E（tmux+浏览器） | security,correct,arch |
| 终局 | 整仓库 | 全量测试 + E2E | security,correct,arch（+ :security 红队） |

## 铁律
- **每个产码阶段必须以一次收敛收尾**，不许"实现完直接进下一层"。跳过收敛 = 假绿。
- 收敛 metric 恒定：连续 N 轮 H+M=0 且不回退且无越界（默认 N=2；终局可要求异构 0 H/M + 安全清零）。
- loop 内的 human-gate 最高优先：任一层命中 DDL/契约/金额 → 整层 STOP 交人工，不自动续。
- loop 引擎仍可被单独调用（"循环狼群修到测试全绿"等），与 ultrawork 复用同一份，不分叉。
- **安全合规门是绝对门，不是回退门（纠 loop 语义）**：Stage 6.5 的 SAST/SCA/secrets/覆盖率/容器/数据生命周期（enterprise-gates G1–G5/G11）**存量红也必须挡**，做成**独立 gate 步、非零退出即 fail-closed**——**绝不塞进 autoresearch-loop 只判"回退(green→red)"的 test-cmd**（否则基线本就带 critical 的仓库会假绿 CONVERGED）。loop 判回退、合规门判绝对阈值，两者正交。
