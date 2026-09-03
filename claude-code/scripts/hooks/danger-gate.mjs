#!/usr/bin/env node
// PreToolUse 确定性人工卡点（human-gate 卡点2 的硬兜底）。
// 设计哲学："必须 100% 发生的事不靠模型自觉，写成 hook"。
// 因为 settings.json 开了 skipDangerousModePermissionPrompt:true（原生权限弹窗被关），
// 本 hook 是高危/不可回滚操作的唯一确定性闸门。
//
// 命中高危模式 → exit 2 阻断 + stderr 回灌；未命中 → exit 0 放行。
// 放行口：命令含 "已知风险" 或 "gate-ack" → 视为用户已确认，放行（human-gate 第 4 步）。
//
// v2（异构评审 codex+opencode 反馈后加固）：
//  - 不再用"命令开头是只读工具"整条 early-return（会被 `echo ok; mysql -e "DROP TABLE"` 绕过）；
//    只读白名单仅对【单一简单命令】（无 ; && || | 换行）生效。
//  - 复合命令按 ; && || | 换行拆成语句逐条扫描。
//  - 覆盖 SQL 文件执行（mysql/psql < file、-f、-i）、迁移 runner、更全 DDL、PowerShell 递归删除。
//  - DML 的 WHERE 判断先剥离单引号字符串字面量，避免 `SET note='WHERE'` 误判为安全。

import { readFileSync } from "node:fs";

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

let payload = {};
try { payload = JSON.parse(readStdin() || "{}"); } catch { process.exit(0); }

const tool = payload.tool_name || payload.tool || "";
if (tool !== "Bash") process.exit(0);

const cmd = String(payload.tool_input?.command ?? payload.tool_input?.cmd ?? "");
if (!cmd.trim()) process.exit(0);

// 显式放行口（用户确认后）
if (/已知风险|gate-ack/i.test(cmd)) process.exit(0);

// 是否复合命令（含 shell 串接/管道/换行）
const SEP = /;|\n|&&|\|\|?|\|/;
const compound = SEP.test(cmd);

// 单一简单只读命令直接放行（避免 grep "DROP TABLE" file 之类误伤）；复合命令不走此捷径
if (!compound &&
    /^\s*(grep|rg|ag|cat|less|more|head|tail|echo|printf|ls|ll|find|wc|diff|stat|file|which|where|type|awk|sed\s+-n|git\s+(status|log|diff|show|branch|remote))\b/i.test(cmd)) {
  process.exit(0);
}

// 拆成语句逐条判定
const segments = cmd.split(/;|\n|&&|\|\|?|\|/).map(s => s.trim()).filter(Boolean);

// 剥离单引号字符串字面量（SQL 字面量用单引号），用于 WHERE 结构判断，避免 SET note='WHERE' 误判
const stripSqlStrings = s => s.replace(/'[^']*'/g, "''");

// 每条规则：[测试函数(rawSeg) -> bool, 分类]
const RULES = [
  // ---- DDL（建/删/改 结构）----
  [s => /\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|PROCEDURE|FUNCTION|TRIGGER)\b/i.test(s), "DDL：DROP（删表/库/索引/视图等）"],
  [s => /\bTRUNCATE\b/i.test(s), "DDL：TRUNCATE（清空表）"],
  [s => /\bALTER\s+TABLE\b/i.test(s), "DDL：ALTER TABLE（改表结构）"],
  [s => /\bCREATE\s+(UNIQUE\s+)?(TABLE|INDEX|VIEW)\b/i.test(s), "DDL：CREATE TABLE/INDEX/VIEW"],
  // ---- SQL 文件执行 / 迁移（命令串看不到文件内容，保守拦截）----
  [s => /\b(mysql|mariadb|psql|sqlcmd|sqlite3|sqlplus|mongo|mongosh)\b[^\n]*(<\s*\S|\s-f\s|\s-i\s|--file=)/i.test(s), "SQL 文件执行（mysql/psql < file 或 -f/-i，文件内容不可见）"],
  [s => /\b(flyway|liquibase|alembic|knex\s+migrate|prisma\s+migrate|sequelize\s+db:migrate|rails\s+db:migrate|php\s+artisan\s+migrate|goose\s+up|migrate\s+(up|-path))\b/i.test(s), "数据库迁移 runner（生产变更卡点2）"],
  // ---- 批量 DML：DELETE/UPDATE 缺 WHERE ----
  [s => /\bDELETE\s+FROM\b/i.test(s) && !/\bWHERE\b/i.test(stripSqlStrings(s)), "批量 DML：DELETE 无 WHERE（全表删除）"],
  [s => /\bUPDATE\s+[`"\[\]\w.]+\s+SET\b/i.test(s) && !/\bWHERE\b/i.test(stripSqlStrings(s)), "批量 DML：UPDATE 无 WHERE（全表更新）"],
  // ---- 灾难性文件系统：类 Unix ----
  [s => /\brm\b/i.test(s) && /(-[a-zA-Z]*r[a-zA-Z]*\b|--recursive)/i.test(s) && /\s(\/|~|\$HOME|\*|\.|\.\.)(\s|\/|$)/.test(s), "灾难性：rm 递归删除 指向 根/家/通配/当前或上级目录"],
  // ---- 灾难性文件系统：Windows / PowerShell ----
  [s => /\bRemove-Item\b[^\n]*-(Recurse|r)\b/i.test(s) && /\bRemove-Item\b[^\n]*-(Force|f)\b/i.test(s), "灾难性：PowerShell Remove-Item -Recurse -Force（递归强删）"],
  [s => /\b(rmdir|rd)\b[^\n]*\/s\b/i.test(s) || /\bdel\b[^\n]*\/s\b/i.test(s), "灾难性：rd/del /s（递归删除）"],
  [s => /\b(Format-Volume|Clear-Disk|Remove-Item\s+-Path\s+[A-Za-z]:\\?\s*$)/i.test(s), "灾难性：磁盘格式化/清盘"],
  // ---- 强制推送（可丢历史）----
  [s => /\bgit\s+push\b[^\n]*(--force(?!-with-lease)|\s-f\b)/i.test(s), "破坏性：git push --force（可覆盖远端历史，建议 --force-with-lease）"],
];

for (const seg of segments) {
  for (const [test, label] of RULES) {
    if (test(seg)) {
      process.stderr.write(
        `🛑 人工卡点（danger-gate）：检测到高危操作 — ${label}\n` +
        `命中片段：${seg.slice(0, 160)}\n` +
        `这是不可回滚/生产级改动，属于 human-gate 卡点2。先停下，向用户给出：\n` +
        `  1) 影响范围（哪些表/多少行/是否锁表/删哪些文件） 2) 回滚方案 3) 等用户确认\n` +
        `用户明确「已知风险，执行」后，在命令中加入 "已知风险" 或 "gate-ack" 重发即可放行。\n`
      );
      process.exit(2);
    }
  }
}

process.exit(0);
