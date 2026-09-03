#!/bin/bash
# 会话快照脚本：触发自动压缩 / 会话停止时调用
# 把当前项目的关键状态抽到 .claude/session-snapshot.md
# 让自动压缩后或新会话起开仍能续接上下文
#
# Hook 输入：JSON via stdin（含 cwd / session_id 等）
# Hook 输出：原样回传 stdin（不阻塞）

set -e

INPUT=$(cat)
CWD=$(echo "$INPUT" | python -c "import sys,json; d=json.load(sys.stdin); print(d.get('cwd',''))" 2>/dev/null || echo "")
[ -z "$CWD" ] && CWD="$PWD"

SNAPSHOT="$CWD/.claude/session-snapshot.md"
mkdir -p "$(dirname "$SNAPSHOT")"

# 如果已经存在用户写的快照（手工维护），不覆盖业务部分；只追加最新自动状态到末尾
AUTO_SECTION_START="<!-- AUTO-SNAPSHOT-BEGIN -->"
AUTO_SECTION_END="<!-- AUTO-SNAPSHOT-END -->"

# 如果文件不存在，写一个最小骨架
if [ ! -f "$SNAPSHOT" ]; then
    cat > "$SNAPSHOT" <<EOF
# 会话快照

> 由 hook 自动维护，新会话起开会自动 read 接续上下文。

$AUTO_SECTION_START
$AUTO_SECTION_END
EOF
fi

# 如果文件存在但没有 AUTO 段，追加之
if ! grep -q "$AUTO_SECTION_START" "$SNAPSHOT"; then
    printf "\n\n%s\n%s\n" "$AUTO_SECTION_START" "$AUTO_SECTION_END" >> "$SNAPSHOT"
fi

# 收集自动状态
NOW=$(date '+%Y-%m-%d %H:%M:%S')
GIT_BRANCH=$(cd "$CWD" 2>/dev/null && git branch --show-current 2>/dev/null || echo "(non-git)")
GIT_STATUS=$(cd "$CWD" 2>/dev/null && git status -s 2>/dev/null | head -30 || echo "")
GIT_DIFF_STAT=$(cd "$CWD" 2>/dev/null && git diff --stat HEAD 2>/dev/null | tail -3 || echo "")
RECENT_COMMITS=$(cd "$CWD" 2>/dev/null && git log --oneline -5 2>/dev/null || echo "")

# 构建自动段内容
AUTO_CONTENT=$(cat <<EOF
$AUTO_SECTION_START

> 自动状态（最近一次更新：$NOW）
> 由 PreCompact / Stop / SessionStart hook 自动维护

**Git**:
- 分支：\`$GIT_BRANCH\`
- 改动文件（前 30 条）：
\`\`\`
$GIT_STATUS
\`\`\`
- diff 统计：\`$GIT_DIFF_STAT\`
- 最近 5 commits：
\`\`\`
$RECENT_COMMITS
\`\`\`

$AUTO_SECTION_END
EOF
)

# 用 Python 替换 AUTO 段（跨行 sed 在 Git Bash 里不可靠）
python <<PYEOF
import re
path = r"$SNAPSHOT"
with open(path, 'r', encoding='utf-8') as f:
    text = f.read()
new_section = """$AUTO_CONTENT"""
text = re.sub(
    r"$AUTO_SECTION_START.*?$AUTO_SECTION_END",
    new_section,
    text,
    flags=re.DOTALL,
)
with open(path, 'w', encoding='utf-8') as f:
    f.write(text)
PYEOF

# 原样回传 stdin 不阻塞 hook 后续处理
echo "$INPUT"
