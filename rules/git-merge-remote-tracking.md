# 合并远程分支必须先 fetch 用 origin/<branch>

合并别人的 feature 分支到 master / integration 时，必须用 `origin/<branch>` 形式而不是本地同名分支，否则可能把对方的最新 push 漏掉。

## 红线

```bash
# ❌ 错：用本地同名分支，可能是过时的
git merge feature/their-work

# ✅ 对：明示用远端 ref，永远是最新
git fetch origin
git merge origin/feature/their-work
```

## Why

本地 `feature/their-work` 分支只有在你 `git checkout feature/their-work && git pull` 之后才会和远端同步。
平时不操作它，它就一直停在你上次切过去的那个 HEAD。
如果对方在远端持续 push 新 commit，你 merge 本地分支 = merge 对方旧版本，**漏 commit 没有任何报错**。

## 真实案例（2026-05-25）

demo-project 项目 merge `merge/foxess-2.0-into-master` 到 master 时，我用了本地分支：
- 本地 HEAD = `7fb85c65`（旧）
- 远端 HEAD = `3044d242`（新）
- 中间漏了 **31 个 commit**，含：
  - `70fb0146` FoxESS OAuth 续期硬化（5/19 生产事故修复）
  - `b96f2ad1` Hoymiles OAuth 表单 state 持久化
  - `7dd6a442` InverterAuthInfo.accessMode 新列
  - `1bbf445b` CommonPostHandler try-finally 包裹
  - 等 P0/P1 修复多项

用户通过 ssh 到测试服跑 `git diff --stat origin/integration origin/foxess` 才发现 29 文件 / 1250 行差异。
事后用 `git merge origin/merge/foxess-2.0-into-master` 重做才补齐。

## How to apply

合并任何「别人的远端分支」到「我的本地分支」时：

1. 先 `git fetch origin`（保证 origin ref 是最新）
2. 用 `git merge origin/<branch>` 形式合并，不要用 `git merge <branch>`
3. merge 完后跑 `git log <local> ^origin/<branch>` 反向验证 — 输出空 = 远端 commit 完整覆盖
4. 文件级再扫一遍 `git diff --stat origin/integration origin/source-branch`，期望只剩 fixup / master 现有 commit / 新增 DDL

## 配套验证脚本

合 PR / integration 后，**永远跑一遍这个三段检查**：

```bash
# A. 远端 SHA 核对（贴出来给用户/PR 描述用）
git rev-parse origin/master origin/<source-branch> origin/<integration-branch>

# B. 反向缺失检查（应为空）
git log --oneline origin/<source-branch> ^origin/<integration-branch>

# C. 文件级差异（应该只剩自己的 fixup）
git diff --stat origin/<source-branch> origin/<integration-branch>
```

任一步骤异常立即排查，不要假设「编译过就没事」—— commit graph 漏掉的远端修复编译不会报错。
