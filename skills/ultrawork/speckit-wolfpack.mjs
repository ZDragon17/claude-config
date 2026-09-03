// 狼群并行执行器 —— 蒸馏自自研 orchestrator 的【唯一真增量】,作为 Spec-Kit 的可选加速步骤。
// 放在 $speckit-tasks 与 $speckit-implement 之间运行:读 Spec-Kit tasks.md →
//   按【真·文件不相交】把可并行任务分批(修正 Spec-Kit 朴素 [P]:它会把写同一文件的任务也标 [P],并行必撞车)→
//   codex `-s workspace-write` 沙箱 worker 并行执行 + lane 强制(worker 只准碰自己声明的文件,越界 fail-closed)。
// 底座(spec/plan/tasks/converge/门禁)全交给 Spec-Kit;本脚本只补"安全并行"这一件事。
//
// 用法: node speckit-wolfpack.mjs <spec-kit项目dir> [featureName]   (featureName 默认取 specs/ 下唯一目录)
import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const log = (...a) => console.log("[wolfpack]", ...a);
const FILE_RE = /[\w./-]+\.(?:json|mjs|jsx|tsx|ts|js)\b/g; // 长优先:json 必须在 js 前,否则 package.json 会被截成 package.js

// ── 纯函数(可单测):解析 tasks.md 任务行 ──
export function parseTasks(md) {
  const tasks = [];
  for (const line of md.split(/\r?\n/)) {
    const m = line.match(/^\s*-\s*\[([ xX])\]\s*(T\d+)\s*(\[P\])?\s*(?:\[[^\]]+\]\s*)*(.+)$/);
    if (!m) continue;
    const desc = m[4].trim();
    const files = [...new Set((desc.match(FILE_RE) || []).filter((f) => !f.endsWith(".md")))]; // 代码/测试文件,排除 .md 工件
    tasks.push({ id: m[2], done: m[1] !== " ", parallel: !!m[3], desc, files });
  }
  return tasks;
}

// ── 纯函数(可单测):按"文件不相交"排并行批 ──
// 规则:只有 [P] 且有明确文件、且文件与本批已占文件不相交的任务才进同批;
//       同文件 [P] 任务被拆到不同批(修正 Spec-Kit 会撞车的朴素 [P]);非 [P]/无文件任务单独成批(串行)。
export function planBatches(tasks) {
  const pending = tasks.filter((t) => !t.done);
  const batches = [];
  let cur = [], claimed = new Set();
  const flush = () => { if (cur.length) { batches.push(cur); cur = []; claimed = new Set(); } };
  for (const t of pending) {
    const canParallel = t.parallel && t.files.length > 0 && !t.files.some((f) => claimed.has(f));
    if (!canParallel) { flush(); batches.push([t]); continue; } // 串行任务/撞车任务单独一批
    cur.push(t); t.files.forEach((f) => claimed.add(f));
  }
  flush();
  return batches;
}

// ── 执行(codex 沙箱 worker + lane 强制)──
function run(cmd, args, { cwd, input } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell: true });
    let out = ""; p.stdout.on("data", (d) => (out += d)); p.stderr.on("data", (d) => (out += d));
    if (input != null) { p.stdin.write(input); p.stdin.end(); }
    p.on("close", (code) => resolve({ code, out }));
    p.on("error", (e) => resolve({ code: -1, out: String(e) }));
  });
}
const codexWorker = (prompt, cwd) =>
  run("codex", ["exec", "-s", "workspace-write", "--skip-git-repo-check", "-c", "notify=[]", "-"], { cwd, input: prompt });

async function hashTree(dir) {
  const map = new Map();
  const walk = async (d, base = "") => {
    let ents; try { ents = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === "node_modules" || e.name.startsWith(".") || e.name.startsWith("_")) continue; // 排除 VCS/deps/工具 scratch
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(d, e.name), rel);
      else try { map.set(rel, createHash("sha1").update(await readFile(join(d, e.name))).digest("hex")); } catch {}
    }
  };
  await walk(dir); return map;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) { console.error("用法: node speckit-wolfpack.mjs <spec-kit项目dir> [feature]"); process.exit(2); }
  let feature = process.argv[3];
  if (!feature) {
    const specs = existsSync(join(dir, "specs")) ? (await readdir(join(dir, "specs"), { withFileTypes: true })).filter((e) => e.isDirectory()) : [];
    if (specs.length !== 1) { console.error("请指定 feature(specs/ 下有多个或没有目录)"); process.exit(2); }
    feature = specs[0].name;
  }
  const tasksPath = join(dir, "specs", feature, "tasks.md");
  if (!existsSync(tasksPath)) { console.error("找不到", tasksPath, "(先跑 $speckit-tasks)"); process.exit(2); }

  const tasks = parseTasks(await readFile(tasksPath, "utf8"));
  const batches = planBatches(tasks);
  const specCtx = ["spec.md", "plan.md", join("contracts", "library-api.md"), "data-model.md"]
    .map((f) => join(dir, "specs", feature, f)).filter(existsSync);
  let ctx = "";
  for (const f of specCtx) ctx += `\n===== ${f} =====\n` + await readFile(f, "utf8");

  log(`feature=${feature}  待执行任务=${tasks.filter((t) => !t.done).length}  批次=${batches.length}`);
  for (const [i, b] of batches.entries()) {
    const par = b.length > 1;
    log(`批 ${i + 1}: ${par ? "并行" : "串行"} ${b.map((t) => `${t.id}(${t.files.join(",") || "无文件"})`).join(" | ")}`);
    const before = await hashTree(dir);
    const results = await Promise.all(b.map((t) => codexWorker(
      `你在一个 Spec-Kit 项目里执行单个任务。**只准创建/修改这些文件:${t.files.join(", ") || "(按任务描述)"},禁止碰其他文件(并行防撞车)**。` +
      `不得跑测试(流水线统一跑)。任务:${t.id} ${t.desc}\n项目上下文(spec/plan/契约):\n${ctx}\n完成只回 DONE。`,
      dir)));
    // lane 强制:本批只应改到声明的文件
    const allowed = new Set(b.flatMap((t) => t.files));
    const after = await hashTree(dir);
    const off = [...after].filter(([p, h]) => !allowed.has(p) && (!before.has(p) || before.get(p) !== h)).map(([p]) => p);
    log(`  完成 ${results.filter((r) => r.code === 0).length}/${b.length}` + (off.length ? ` ✗ 越界写: ${off.join(", ")}` : " ✓ lane 通过"));
    if (off.length && allowed.size) { log("  越界 fail-closed,停机(建议改进 tasks.md 的文件声明)"); process.exit(1); }
  }
  log("✅ 狼群并行执行完成。接着跑 Spec-Kit 的 $speckit-implement/converge 做集成 + 测试 + 门禁。");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
