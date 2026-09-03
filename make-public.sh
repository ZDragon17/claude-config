#!/usr/bin/env bash
# make-public.sh — 从 master 构建可公开的 main 快照（脱敏 + 排除隐私）
# 用法：在仓库根目录 bash make-public.sh
# 原则：master 永远是私有完整版（含真实项目记忆与真实姓名）；
#       main 是脱敏公开快照，每次重新构建都会覆盖上一次的 main。
set -euo pipefail
cd "$(dirname "$0")"

SRC=$(git branch --show-current)
[ "$SRC" = "master" ] || { echo "请在 master 上运行（当前：$SRC）"; exit 1; }

# 0) 清掉上一次的 main（可重复构建）
git branch -D main 2>/dev/null || true

# 1) 以 master 工作区内容创建无历史的 orphan 分支
git checkout --orphan main
git add -A

# 2) 排除隐私内容（真实工作记忆 / 简历 / provider 清单 / 历史归档）
git rm -rqf --ignore-unmatch \
  docs/resume-draft.md \
  docs/api-provider-matrix.md \
  docs/archive
find projects -type f -name '*.md' ! -name 'README.md' -exec git rm -qf {} + 2>/dev/null || true

# 3) 脱敏：真实姓名与机器用户名 → 占位符（部署脚本动态推断路径，不受影响）
grep -rlI '张不为' --include='*.md' --include='*.html' --include='*.mjs' --include='*.sh' --include='*.bat' --exclude='make-public.sh' . \
  | xargs -r sed -i 's/张不为/作者/g'
grep -rlI -e 'uehSystem' -e '27374' --include='*.json' --include='*.md' --include='*.mjs' --include='*.sh' --exclude='make-public.sh' . \
  | xargs -r sed -i -e 's/27374/yourname/g' -e 's/uehSystem/demo-project/g'

git add -A

# 4) 终检：公开分支不允许残留真实姓名 / 用户名 / 简历 / 项目记忆
if git grep -qE '张不为|27374|resume-draft' -- . ':(exclude)make-public.sh' 2>/dev/null; then
  echo "❌ 终检失败：仍存在敏感内容，禁止发布"; exit 1
fi
[ ! -e docs/resume-draft.md ] && [ ! -d docs/archive ] || { echo "❌ 隐私文件未排除干净"; exit 1; }

git commit -qm "chore: initial public release (sanitized snapshot of agent-config)"
echo "✅ main 快照已构建。发布：git push -f origin main，然后在 GitHub 将可见性改为 Public。"
echo "   回到开发：git checkout master"
