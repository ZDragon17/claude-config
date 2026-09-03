// 会话快照 hook：PreCompact / Stop / SessionEnd 触发时把项目关键状态抽到磁盘
// SessionStart 触发时把磁盘状态注入 additionalContext 让新会话续接
//
// 输入：JSON via stdin，含 cwd / hook_event_name / session_id 等
// 输出：
//   - PreCompact / Stop：原样回传 stdin（不阻塞）
//   - SessionStart：JSON { additionalContext: "..." } 注入到对话开头

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';

const AUTO_BEGIN = '<!-- AUTO-SNAPSHOT-BEGIN -->';
const AUTO_END   = '<!-- AUTO-SNAPSHOT-END -->';

let raw = '';
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) raw += chunk;

let input;
try { input = JSON.parse(raw); } catch { input = {}; }

const rawCwd = input.cwd || process.cwd();
const event = input.hook_event_name || process.env.CLAUDE_HOOK_EVENT || 'unknown';

// === 安全：定位项目根 + 校验路径在项目根内，防止快照写到系统根或漂出工程外 ===
//
// Codex 三轮复核迭代后的最终方案：
//   v1（错）：直接 join(cwd, '.claude', ...) — cwd='/' 时漂出 project root
//   v2（错）：fallback 到 .claude 标识 — ~/.claude 是 Claude Code 全局配置目录被误识别
//   v3（错）：用 dir !== home 守卫 — 字符串比较脆弱（Windows 大小写不敏感、symlink、
//             ~/.config / ~/AppData 等替代全局目录都没覆盖）
//   v4（当前）：**只信 .git** —
//             所有真实项目都是 git repo；user home 一般不是 git repo；
//             非 git 临时目录跳过快照（合理）。
//
// 规则：
//   1. 唯一标识：从 cwd 沿父目录向上找最近的 .git（dir 或 file 都算，支持 worktree）
//   2. resolve() 规范化绝对路径（吞 ..）
//   3. snapshotPath 用 relative() 白名单校验（必须严格 == 'session-snapshot.md'）
//   4. 找不到 → 跳过快照，原样回传 stdin
function findProjectRoot(startDir) {
    let dir = resolve(startDir);
    while (true) {
        try {
            // .git 既可能是目录（普通 repo）也可能是文件（worktree gitlink），existsSync 都返 true
            if (existsSync(join(dir, '.git'))) return dir;
        } catch { /* permission denied 等，继续向上 */ }
        const parent = dirname(dir);
        if (parent === dir) return null; // 到达文件系统根
        dir = parent;
    }
}

const projectRoot = findProjectRoot(rawCwd);

function safeExit(extraOut = null) {
    if (extraOut !== null) {
        process.stdout.write(extraOut);
    } else if (event === 'SessionStart') {
        process.stdout.write(JSON.stringify({}));
    } else {
        process.stdout.write(raw);
    }
    process.exit(0);
}

if (!projectRoot) {
    // 非项目目录（如 ~ 或 /），不写快照
    safeExit();
}

const snapshotPath = resolve(projectRoot, '.claude', 'session-snapshot.md');

// 路径必须严格在 projectRoot/.claude 内
const expectedDir = resolve(projectRoot, '.claude');
const rel = relative(expectedDir, snapshotPath);
if (rel.startsWith('..') || isAbsolute(rel) || rel === '') {
    // rel === 'session-snapshot.md' 是预期，其他情况都是异常
    if (rel !== 'session-snapshot.md') {
        // 路径漂移，拒绝写
        safeExit();
    }
}

const cwd = projectRoot;   // 后续 git 命令用 projectRoot 而不是原始 cwd

const sh = (cmd) => {
    try {
        return execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { return ''; }
};

if (event === 'SessionStart') {
    // 把磁盘快照注入到新会话开头
    if (existsSync(snapshotPath)) {
        const text = readFileSync(snapshotPath, 'utf8');
        process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
                hookEventName: 'SessionStart',
                additionalContext:
                    `# 上次会话快照（自动注入）\n\n` +
                    `从 \`.claude/session-snapshot.md\` 读取，新会话起开自动续接：\n\n${text}`
            }
        }));
    } else {
        process.stdout.write(JSON.stringify({}));
    }
    process.exit(0);
}

// PreCompact / Stop / SessionEnd：写快照
mkdirSync(dirname(snapshotPath), { recursive: true });

let existing = '';
if (existsSync(snapshotPath)) {
    existing = readFileSync(snapshotPath, 'utf8');
}

// 如果文件不存在或没有 AUTO 段，先创最小骨架
if (!existing) {
    existing = `# 会话快照\n\n> 由 hook 自动维护，新会话 SessionStart 时自动注入到对话开头。\n\n${AUTO_BEGIN}\n${AUTO_END}\n`;
}
if (!existing.includes(AUTO_BEGIN)) {
    existing += `\n\n${AUTO_BEGIN}\n${AUTO_END}\n`;
}

const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
const branch = sh('git branch --show-current') || '(non-git)';
const status = sh('git status -s').split('\n').slice(0, 30).join('\n');
const diffStat = sh('git diff --stat HEAD').split('\n').slice(-3).join('\n');
const recentCommits = sh('git log --oneline -5');

const autoBlock =
    `${AUTO_BEGIN}\n\n` +
    `> 自动状态（${event} @ ${now}）\n\n` +
    `**Git**\n\n` +
    `- 分支：\`${branch}\`\n` +
    `- 改动文件（前 30 条）：\n\n` +
    '```\n' + (status || '(clean)') + '\n```\n\n' +
    `- diff 统计：\n\n` +
    '```\n' + (diffStat || '(no diff vs HEAD)') + '\n```\n\n' +
    `- 最近 5 commits：\n\n` +
    '```\n' + (recentCommits || '(no commits)') + '\n```\n\n' +
    `${AUTO_END}`;

const updated = existing.replace(
    new RegExp(`${AUTO_BEGIN}[\\s\\S]*?${AUTO_END}`),
    autoBlock
);

writeFileSync(snapshotPath, updated, 'utf8');

// 原样回传 stdin 不阻塞
process.stdout.write(raw);
