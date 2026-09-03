#!/usr/bin/env node
/**
 * 新电脑首次部署脚本 —— 把 settings.json 里硬编码的旧机器路径
 * 自动识别并改写为当前机器的真实路径，避免换机/换用户名后 hook、
 * statusLine、env 块静默失效。
 *
 * 为什么是「部署时一次性改写」而不是「运行时动态展开」：
 *   全局 ~/.claude/settings.json 的 hook command 没有官方可移植占位符
 *   （${CLAUDE_PROJECT_DIR} 指项目目录，不是 .claude），且 $HOME/$USERPROFILE
 *   在 Windows 下展开有 Git Bash(MSYS 路径) vs PowerShell 的不确定性，
 *   踩错就是全部 hook 静默失效。所以运行时保持确定的绝对路径，
 *   仅在部署时一次性改写 —— 零运行时风险，同时对用户而言就是「自动识别」。
 *
 * 设计要点：
 *   - 锚点是脚本自身所在的 .claude 目录（claudeDir），它永远等于当前机器
 *     真实路径，不依赖 settings.json 里任何写死的字段 —— 这样 env.USERPROFILE
 *     不再是被固定住的锚点，而是可以一并被刷新的普通值。
 *   - 旧路径从 settings.json 文本里反推（匹配第一个出现的 .claude 绝对路径），
 *     旧机器家目录 = 旧 .claude 目录去掉 \.claude 后缀，不写死任何机器名。
 *   - 两段替换：① 旧 .claude 路径 → 当前 claudeDir（修所有 hook/statusLine）；
 *     ② 旧家目录 → 当前家目录（刷新 env.HOME / env.USERPROFILE 的值）。
 *   - 只改 settings.json，绝不触碰文档/skill 里作为人名出现的「作者」。
 *   - 幂等：路径已是当前机器的就直接跳过。
 *   - 安全：改写前打印命中数，并写 settings.json.bak 备份；改写后再校验 JSON。
 *
 * 用法（在 ~/.claude 目录下）：
 *   node scripts/setup-new-machine.mjs
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const claudeDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const settingsPath = join(claudeDir, "settings.json");

if (!existsSync(settingsPath)) {
  console.error(`找不到 settings.json：${settingsPath}`);
  process.exit(1);
}

const raw = readFileSync(settingsPath, "utf8");

// 先校验是合法 JSON，避免改坏文件（替换用文本，校验用解析，互不影响）
try {
  JSON.parse(raw);
} catch (e) {
  console.error(`settings.json 不是合法 JSON，已中止以免破坏文件：${e.message}`);
  process.exit(1);
}

// settings.json 文本里路径是 JSON 转义形式（单反斜杠写成双反斜杠）
const escapeBackslash = (p) => p.replace(/\\/g, "\\\\");
const unescapeBackslash = (p) => p.replace(/\\\\/g, "\\");

// 反推「旧机器 .claude 绝对路径」：Windows 形（盘符+转义反斜杠）优先，未命中再试 POSIX 形（正斜杠 /…/.claude），
// 兼顾 mac/linux 同平台迁移。不依赖任何写死字段。
const winMatch = raw.match(/[A-Za-z]:(?:\\\\[^\\"]+)*\\\\\.claude/);
const posixMatch = winMatch ? null : raw.match(/"((?:\/[^/"\\ ']+)+\/\.claude)/); // 前置引号锚 + 段内禁空格/单引号：排除 URL 内 /…/.claude 及命令串内嵌路径 "/bin/sh -lc '/…/.claude'"（codex M3）
if (!winMatch && !posixMatch) {
  console.log("未在 settings.json 中找到任何 .claude 绝对路径，可能已是可移植形式，跳过。");
  process.exit(0);
}
const srcIsWin = !!winMatch;
const oldClaudeDir = srcIsWin ? unescapeBackslash(winMatch[0]) : posixMatch[1]; // 例：C:\Users\作者\.claude 或 /Users/x/.claude（POSIX 取捕获组，去前置引号）
const oldHome = oldClaudeDir.replace(srcIsWin ? /\\\.claude$/ : /\/\.claude$/, "");

// 当前机器真实路径
const newClaudeDir = claudeDir;
const newHome = process.platform === "win32" ? (process.env.USERPROFILE || homedir()) : homedir();   // codex-M7：非 win32 一律用 homedir()，忽略 WSL/Linux 下从 Windows 继承的 USERPROFILE（否则 POSIX settings 被写进 Windows 家目录路径，跨 OS 守卫也捕不到）

// 跨 OS 守卫：源 settings.json 分隔符/盘符与本机 OS 不一致时，仅改 home 会产出混合分隔符坏路径 →
// 明确 fail-fast（exit 2）而非静默写坏；跨 OS 请在本机重新生成 hook/statusLine 段（分隔符/盘符转换不在本脚本职责内）。
if (srcIsWin !== (process.platform === "win32")) {
  console.error(`跨 OS 迁移不支持：源 settings.json 为 ${srcIsWin ? "Windows" : "POSIX"} 形、本机为 ${process.platform}。`);
  console.error("仅改 home 会产出混合分隔符坏路径，已中止（原文件未动）。请在本机重新生成 settings.json 的 hook/statusLine 段。");
  process.exit(2);
}

// 正斜杠形式的 home 改写（Orca 注入的 hook .orca/agent-hooks/*.cmd 用正斜杠、不含 .claude，①/② 的反斜杠 .claude
// 正则漏掉 → 迁移后残留旧用户名 → hook 静默失效）。oldHome 已由 ① 从真实 .claude 路径可靠推出（任意盘符/目录，
// 不限 /Users/），故直接取其正斜杠形做锚——不再独立正则重探（消除硬编码 /Users/ 漏改、首个匹配误选 Public/他账户）。
// 残留：若上一次用旧版脚本只改了 .claude 未改 .orca，则 oldHome 已=newHome、本轮短路跳过 .orca（升级边角，重装即净）。
const newHomeFwd = newHome.replace(/\\/g, "/");
const oldHomeFwd = oldHome.replace(/\\/g, "/");
const needFwd = oldHomeFwd !== newHomeFwd && raw.includes(oldHomeFwd);

// 幂等：.claude 路径与家目录都已是当前机器的就无需改写
if (oldClaudeDir === newClaudeDir && oldHome === newHome && !needFwd) {
  console.log(`无需改写：settings.json 路径已是当前机器的（${newClaudeDir}）`);
  process.exit(0);
}

writeFileSync(`${settingsPath}.bak`, raw, "utf8");

let next = raw;
let pathHits = 0;
let homeHits = 0;

// ① 旧 .claude 路径 → 当前 claudeDir（修所有 hook / statusLine 命令路径）
if (oldClaudeDir !== newClaudeDir) {
  const oldClaudeDirEscaped = escapeBackslash(oldClaudeDir);
  const newClaudeDirEscaped = escapeBackslash(newClaudeDir);
  pathHits = next.split(oldClaudeDirEscaped).length - 1;
  next = next.split(oldClaudeDirEscaped).join(newClaudeDirEscaped);
}

// ② 旧家目录 → 当前家目录（刷新 env.HOME / env.USERPROFILE 的值）
// 此时 next 里 .claude 路径已是新值，剩下的 oldHome 命中即 env 块里的家目录值。
if (oldHome !== newHome) {
  const oldHomeEscaped = escapeBackslash(oldHome);
  const newHomeEscaped = escapeBackslash(newHome);
  homeHits = next.split(oldHomeEscaped).length - 1;
  next = next.split(oldHomeEscaped).join(newHomeEscaped);
}

// ③ 正斜杠形式的旧 home → 当前 home（修 Orca .orca/agent-hooks 绝对 hook；①/② 只动反斜杠形）。
// 带边界替换：home 前缀后必接 '/'（后续路径段）或 '"'（JSON 值末尾），避免 C:/Users/li 误伤 C:/Users/lisa。
let fwdHits = 0;
if (needFwd) {
  for (const b of ["/", "\""]) {
    fwdHits += next.split(oldHomeFwd + b).length - 1;
    next = next.split(oldHomeFwd + b).join(newHomeFwd + b);
  }
}

// 改完再次校验仍是合法 JSON，否则放弃写入（原文件未动）
try {
  JSON.parse(next);
} catch (e) {
  console.error(`改写后 JSON 非法，已放弃写入（原文件未动）：${e.message}`);
  process.exit(1);
}

writeFileSync(settingsPath, next, "utf8");

console.log(`已自动识别并改写 settings.json：`);
console.log(`  .claude 目录：${oldClaudeDir}  ->  ${newClaudeDir}（命中 ${pathHits} 处）`);
console.log(`  家目录(env) ：${oldHome}  ->  ${newHome}（命中 ${homeHits} 处）`);
if (needFwd) console.log(`  正斜杠 hook：${oldHomeFwd}  ->  ${newHomeFwd}（命中 ${fwdHits} 处）`);
console.log(`原文件已备份到 settings.json.bak`);
console.log("");
console.log("接下来仍需手动完成（这些不在本仓库里）：");
console.log("  1. claude login            —— 重新登录，补 .credentials.json");
console.log("  2. 重配 MCP 服务器          —— chrome-devtools / dbx（存在 ~/.claude.json，不随仓库同步）");
console.log("  3. 按 install-plugins.md 重装插件 —— autoresearch / codex / understand-anything 等");
console.log("  4. 如有本地偏好，补 settings.local.json / mode.json");
