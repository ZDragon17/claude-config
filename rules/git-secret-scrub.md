---
alwaysApply: false
description: "Git 历史里的 secret/敏感文件清理手册 — git-filter-repo 一键清，必须配合 revoke + 警告其他 clone"
---

# Git Secret 历史清理

误 commit 了 token / credentials / API key / 大文件到 git history 后的标准处理流程。**仅 untrack 不够** — 历史里还在，必须重写。

## 何时触发

- 发现 `git ls-files` 列出了 `.credentials.json` / `*.env` / `*.pem` / `*.key` / `id_rsa` 等敏感文件
- `grep -rE "sk-[a-zA-Z0-9]{20,}|Bearer [a-zA-Z0-9]{20,}|password.*=.*['\"]" $(git ls-files)` 命中真实密钥值
- 误 commit 了大文件（>10MB 二进制 / build 产物 / node_modules）想从历史里删
- 用户原话：「清干净」「scrub」「彻底删」「token 泄漏了」

## 标准流程（按顺序）

### 1. 工具就位

```bash
# git-filter-repo 是推荐工具（filter-branch 已 deprecated）
python -m git_filter_repo --version
# 没装：pip install git-filter-repo
# Windows 上 `git filter-repo` 命令形式可能 PATH 不通，统一用 python -m 形式
```

### 2. 备份兜底

```bash
cd <repo>
git tag backup-before-filter-$(date +%Y%m%d-%H%M%S)
# 也可以 cp -r .git ../git-backup-$(date +%Y%m%d) 双保险
```

### 3. 重写历史

```bash
# 单文件清理
python -m git_filter_repo --path .credentials.json --invert-paths --force

# 多文件
python -m git_filter_repo --path .env --path secrets.json --invert-paths --force

# 按内容（高熵字符串）
python -m git_filter_repo --replace-text secrets.txt --force
# secrets.txt 每行一个要替换的字符串：sk-abc123==>REDACTED
```

**注意**：filter-repo 跑完会**自动移除 origin remote**（安全设计，防止误推）。需要手动加回：
```bash
git remote add origin <url>
```

### 4. 验证清除

```bash
git log --all --pretty=format: --name-only | sort -u | grep <filename>
# 应该输出空 — 文件名在 commit messages 里出现不算，要看 file changes
```

### 5. 强制推送

```bash
git push origin <branch> --force-with-lease 2>&1
# 整段重写后大概率被 stale info 拒绝（安全机制正确触发） → 改用 --force
git push origin <branch> --force
```

### 6. 不可省略的善后

**a. revoke 泄漏的 secret**（最关键 — 仓库改了但 token 字符串本身仍有效）
- OAuth token / API key → 去对应控制台 revoke
- Password → 立即修改
- SSH key → 去服务端删 public key + 本地生成新 keypair

**b. 通知其他 clone**
- 其他机器 / 协作者的 clone 还有旧 history
- 让他们 `git fetch && git reset --hard origin/<branch>` 或重新 clone
- pull 不会 work（divergent history）

**c. （可选）通知 GitHub 清缓存**
- Public 仓库 token 泄漏过 → 联系 GitHub support 清 commit cache
- 否则旧 commit SHA 还能通过 `https://github.com/<user>/<repo>/commit/<old-sha>` 直接访问几天

## 反例（什么时候**不**该用）

- 只是不想 track 某个文件 → `git rm --cached <file>` + 加 `.gitignore` 即可，**不需要重写历史**
- 想撤销最近一次错误 commit → `git revert` 或 `git reset --soft HEAD~1`，**不需要重写历史**
- 文件已 push 但还不是 secret（只是不该 track）→ untrack 即可，secret-scrub 是 OOM 杀鸡

## 关键 Why

`git rm --cached` + 加 .gitignore + 新 commit 只是「不再 track」，**旧 commit 里的内容文件还在**。任何 clone 过的人 `git log --all` 都能挖出来。这就是为什么 secret 一旦 push 必须做两件事：① 重写 history ② revoke secret 字符串本身。

少做任一步 = 安全没补完。

## 配套警告

force push 到 master/main 是不可逆操作，按全局规则需要用户明确同意。这条规则**只在用户明示要清理 secret 时**才执行流程，不要主动触发。
