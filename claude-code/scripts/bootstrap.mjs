#!/usr/bin/env node
/**
 * 新电脑一键还原 —— clone 本仓库到 ~/.claude 后，跑一次本脚本即可。
 *
 *   node scripts/bootstrap.mjs
 *
 * 它自动完成所有能自动化的步骤：
 *   1. 改写 settings.json 里硬编码的用户目录路径（调 setup-new-machine.mjs）
 *   2. 注册 marketplace 并安装启用的插件（autoresearch / codex）
 *   3. 重建 MCP 服务器（chrome-devtools / dbx）
 *   4. 给缺 node_modules 的 skill 跑 npm install
 *
 * 唯一无法自动化的是 `claude login`（OAuth 浏览器授权，安全设计），
 * 脚本结尾会引导你手动完成。
 *
 * 全程幂等：已完成的步骤会自动跳过，可反复执行。
 * 单步失败只打警告、不中断，最后汇总。
 */

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readdirSync, existsSync } from "node:fs";

const isWin = process.platform === "win32";
const scriptsDir = dirname(fileURLToPath(import.meta.url));
const warnings = [];

// 统一跑命令：shell 模式，继承输出。返回是否成功。
function run(cmd, { allowFail = false, label = cmd } = {}) {
  console.log(`\n$ ${cmd}`);
  const r = spawnSync(cmd, { shell: true, stdio: "inherit" });
  const ok = r.status === 0;
  if (!ok && !allowFail) warnings.push(label);
  return ok;
}

// 静默跑命令，只取 stdout（用于幂等探测）
function capture(cmd) {
  const r = spawnSync(cmd, { shell: true, encoding: "utf8" });
  return (r.stdout || "") + (r.stderr || "");
}

// 0. 前置：claude CLI 必须在 PATH
if (capture("claude --version").trim() === "" ) {
  console.error("未检测到 claude 命令。请先安装 Claude Code 本体，再跑本脚本。");
  process.exit(1);
}

// 1. 改写硬编码路径
console.log("\n【1/6】改写 settings.json 路径");
run(`node "${join(scriptsDir, "setup-new-machine.mjs")}"`, { label: "改写路径" });

// 2. 注册 marketplace（幂等，失败不中断）
console.log("\n【2/6】注册插件 marketplace");
const marketplaces = [
  ["autoresearch", "uditgoenka/autoresearch"],
  ["openai-codex", "openai/codex-plugin-cc"],
];
for (const [name, repo] of marketplaces) {
  run(`claude plugin marketplace add ${repo}`, { allowFail: true, label: `marketplace ${name}` });
}

// 3. 安装启用的插件（enabledPlugins 里为 true 的）
console.log("\n【3/6】安装插件");
const plugins = ["autoresearch@autoresearch", "codex@openai-codex"];
const installed = capture("claude plugin list");
for (const p of plugins) {
  const shortName = p.split("@")[0];
  if (installed.includes(shortName)) {
    console.log(`  已安装，跳过：${p}`);
    continue;
  }
  run(`claude plugin install ${p} --scope user`, { allowFail: true, label: `插件 ${p}` });
}

// 4. 重建 MCP 服务器（按平台生成启动命令；已存在则跳过）
console.log("\n【4/6】配置 MCP 服务器");
const npxPrefix = isWin ? "cmd /c npx" : "npx";
const mcpServers = [
  ["chrome-devtools", `${npxPrefix} chrome-devtools-mcp@latest --no-usage-statistics`],
  ["dbx", `${npxPrefix} -y @dbx-app/mcp-server`],
];
const mcpList = capture("claude mcp list");
for (const [name, launch] of mcpServers) {
  if (mcpList.includes(name)) {
    console.log(`  已存在，跳过：${name}`);
    continue;
  }
  run(`claude mcp add --scope user ${name} -- ${launch}`, { allowFail: true, label: `MCP ${name}` });
}

// 5. 安装 codex loop 后端 CLI（@openai/codex npm 包）——区别于步骤 3 的 codex 斜杠命令插件。
//    autoresearch-loop.sh --backend codex 靠 PATH 里的 `codex` 命令（脚本用 command -v codex fail-fast），
//    Claude Code 的 codex 斜杠命令插件（codex@openai-codex）不提供这个 CLI，是两回事。
//    幂等：已在 PATH（codex --version 退出码 0）则跳过；cmd.exe 无 command -v，故用退出码探测保证跨平台。
console.log("\n【5/6】安装 codex loop 后端 CLI（@openai/codex npm CLI，≠ codex 斜杠插件）");
if (spawnSync("codex --version", { shell: true }).status === 0) {
  console.log("  已安装，跳过：codex（@openai/codex npm CLI，loop --backend codex 用）");
} else {
  run("npm i -g @openai/codex", { allowFail: true, label: "codex loop 后端 CLI (@openai/codex)" });
}

// 6. skill 依赖（有 package.json 但缺 node_modules 的，跑 npm install；用 --prefix 免 cwd）
console.log("\n【6/6】安装 skill 依赖");
const skillsDir = join(dirname(scriptsDir), "skills");
let anySkillDep = false;
if (existsSync(skillsDir)) {
  for (const s of readdirSync(skillsDir)) {
    const dir = join(skillsDir, s);
    if (existsSync(join(dir, "package.json")) && !existsSync(join(dir, "node_modules"))) {
      anySkillDep = true;
      run(`npm --prefix "${dir}" install`, { allowFail: true, label: `skill 依赖 ${s}` });
    }
  }
}
if (!anySkillDep) console.log("  无缺失，跳过");

// 汇总
console.log("\n========================================");
if (warnings.length) {
  console.log("以下步骤未成功，请手动检查：");
  warnings.forEach((w) => console.log(`  - ${w}`));
} else {
  console.log("自动步骤全部完成。");
}
console.log("\n最后一步需你手动完成（无法自动化）：");
console.log("  claude login   —— OAuth 浏览器授权登录");
console.log("\n验证：claude plugin list && claude mcp list");
console.log("");
console.log("codex loop 后端（可选，用 autoresearch-loop.sh --backend codex 时才需要；上面第 5 步已自动装 @openai/codex CLI，仅登录需手动）：");
console.log("  codex login                          —— codex 也需登录（与 claude 各自独立）");
console.log("  bash scripts/loop-codex-test.sh      —— 验证 codex 后端本机可用（PONG 冒烟；加 LOOP_CODEX_E2E=1 验完整循环）");
