// 自跑流水线驱动 v2 —— 完整 ultrawork 管道:确定性状态机 + 无头 LLM worker(claude -p)
//   + 异构复审(codex) + 机械/绝对门禁 + 收敛环 + 闸/卡点引擎(异步预批,可恢复)。
// 设计原则:开发环免人驱动；闸①/闸②/3卡点由设计硬停(可经审批文件异步放行,不进紧环)。
//
// 用法:
//   node orchestrator.mjs "<需求>" [目录]          # 跑到下一个未批的闸就停
//   node orchestrator.mjs --approve gate1 [目录]    # 异步预批某闸,再次运行即续跑
//   node orchestrator.mjs --status [目录]           # 查看进度
import { spawn } from "node:child_process";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { createHash, createHmac } from "node:crypto";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const has = (n) => argv.includes(n);

const log = (...a) => console.log(`[orch ${new Date().toISOString().slice(11, 19)}]`, ...a);
const banner = (s) => log("\n──────── " + s + " ────────");
// 控制面密钥:worker 子进程环境已剥离该变量 → worker 无法自我 --approve、无法伪造状态签名。
const TOKEN = process.env.KB_ORCH_TOKEN || "";
const workerEnv = () => { const e = { ...process.env }; delete e.KB_ORCH_TOKEN; return e; };
const sign = (obj) => (TOKEN ? createHmac("sha256", TOKEN).update(JSON.stringify(obj)).digest("hex") : "");

function run(cmd, args, { cwd, input, timeout = 900_000, shell = false, env } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, shell, env });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    if (input != null) { p.stdin.write(input); p.stdin.end(); }
    const t = setTimeout(() => { try { if (process.platform === "win32" && p.pid) spawn("taskkill", ["/pid", String(p.pid), "/t", "/f"]); } catch {} p.kill(); }, timeout);
    p.on("close", (code) => { clearTimeout(t); resolve({ code, out }); });
    p.on("error", (e) => { clearTimeout(t); resolve({ code: -1, out: String(e) }); });
  });
}
// 生成引擎(默认 codex):`codex exec -s workspace-write` —— **真沙箱**,写约束在 cwd(实测拦 ../ 与绝对路径越界写),补上 claude flags 补不了的 H1 写隔离。
// 异构复审用【另一】引擎(claude,只读推理,源码在 prompt 里),保住跨引擎复审的载重属性。`ORCH_GEN=claude` 可反转(claude 生成 / codex 复审)。
const ENGINE = process.env.ORCH_GEN || "codex";
const gen = (prompt, cwd) => ENGINE === "codex"
  ? run("codex", ["exec", "-s", "workspace-write", "--skip-git-repo-check", "-c", "notify=[]", "-"], { cwd, input: prompt, timeout: 900_000, shell: true, env: workerEnv() })
  : run("claude", ["-p", "--allowedTools", "Read Write Edit", "--permission-mode", "acceptEdits"], { cwd, input: prompt, timeout: 600_000, shell: true, env: workerEnv() });
const rev = (prompt) => ENGINE === "codex"
  ? run("claude", ["-p", "--allowedTools", "Read"], { input: prompt, timeout: 600_000, shell: true, env: workerEnv() })
  : run("codex", ["exec", "--skip-git-repo-check", "-s", "read-only", "-c", "notify=[]", "-"], { input: prompt, timeout: 900_000, shell: true, env: workerEnv() });
const nodeTest = (cwd) => run(process.execPath, ["--test"], { cwd });

function parseTest(out) {
  // 取最后一处摘要(node 真实汇总在末尾;防测试体内 console.log 伪造 TAP 行被首个匹配取走)
  const g = (k) => { const ms = [...out.matchAll(new RegExp(`[#ℹ]\\s*${k}\\s+(\\d+)`, "g"))]; return ms.length ? +ms[ms.length - 1][1] : 0; };
  return { tests: g("tests"), pass: g("pass"), fail: g("fail") };
}
// 只认最后一条独立成行的 VERDICT(防源码 prompt 注入在中间植入假判定);无则视为未收敛
const parseVerdict = (out) => {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].match(/^VERDICT\s+H=(\d+)\s+M=(\d+)$/i);
    if (m) return { H: +m[1], M: +m[2] };
  }
  return { H: -1, M: -1 };
};

async function srcBundle(cwd) {
  let b = "";
  const walk = async (d, base = "") => {
    for (const e of await readdir(d, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(d, e.name), rel);
      else if (/\.(mjs|js|ts)$/.test(e.name) && !/\.test\./.test(e.name)) b += `\n===== ${rel} =====\n` + await readFile(join(d, e.name), "utf8");
    }
  };
  await walk(cwd);
  return b;
}

// ── 卡点关键词(命中→该类改动强制人工闸,不自动跨越)──
const GATE_KEYWORDS = /金额|balance|payment|结算|统计|汇总|报表|DDL|ALTER\s+TABLE|DROP\s+TABLE|migration|批量|DTO|VO|openapi|契约|MQTT|生产|部署/i;

// ── 状态 & 审批(异步、可恢复)──
const stateFile = (dir) => join(dir, ".orch-state.json");
async function loadState(dir) {
  let raw; try { raw = await readFile(stateFile(dir), "utf8"); } catch { return { done: [], approvals: [], req: null }; }
  const s = JSON.parse(raw);
  if (TOKEN) { const { _sig, ...body } = s; if (_sig !== sign(body)) throw new Error("状态签名校验失败(疑似 worker 篡改),fail-closed 拒绝启动"); }
  return s;
}
const saveState = (dir, s) => { const { _sig, ...body } = s; return writeFile(stateFile(dir), JSON.stringify(TOKEN ? { ...body, _sig: sign(body) } : body, null, 2)); };

// ── 门禁类型 ──
// human-gate:检查审批,未批则停机(exit 10)等异步放行
async function humanGate(name, dir, state, ctx) {
  if (state.approvals.includes(name)) { log(`⛔→✓ ${name}:已异步预批,放行`); return true; }
  await saveState(dir, state);
  banner(`⛔ ${name} 人工卡点：停机等审批`);
  log(ctx);
  log(`审批方式:node orchestrator.mjs --approve ${name} ${dir}  然后重跑同一命令续跑`);
  process.exit(10);
}

// 从 LLM 输出里稳健提取 JSON(容忍 markdown 围栏/前后散文)
function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fence ? fence[1] : text;
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s < 0 || e < 0) throw new Error("输出中无 JSON");
  return JSON.parse(raw.slice(s, e + 1));
}

// 目录文件哈希快照(用于狼群 lane 强制:检出越界写)
async function hashTree(dir) {
  const map = new Map();
  const walk = async (d, base = "") => {
    let ents; try { ents = await readdir(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === ".orch-state.json" || e.name === "modules.json") continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(d, e.name), rel);
      else try { map.set(rel, createHash("sha1").update(await readFile(join(d, e.name))).digest("hex")); } catch {}
    }
  };
  await walk(dir);
  return map;
}

// 实现阶段:分解 → 狼群并行(Promise.all,按契约各占文件防碰撞) → 集成
async function stageImplement(dir, req) {
  banner("实现:分解 → 狼群并行 → 集成");
  const hasDesign = existsSync(join(dir, "design.md"));
  await gen(`把实现分解为相互独立、可并行构建的模块。${hasDesign ? "依据当前目录 design.md/tasks.md" : "依据需求：" + req}。` +
  `在当前目录写 modules.json(纯 JSON,不要 markdown 围栏),格式:` +
  `{"modules":[{"name":"","file":"src/x.mjs","testFile":"test/x.test.mjs","spec":"职责+对外接口签名"}],` +
  `"integration":{"files":["src/app.mjs"],"note":"如何组合+集成测试要点"}}。模块间只经明确接口耦合。只回 DONE。`,
  dir);
  let manifest;
  try { manifest = extractJson(await readFile(join(dir, "modules.json"), "utf8")); }
  catch (e) {
    log("modules.json 解析失败,退化为单发实现:", e.message);
    await gen(`按需求实现全部代码与测试(Node ESM+node:test):${req}。写完只回 DONE(流水线会跑测试,你无需运行)。`, dir);
    return;
  }
  const mods = manifest.modules || [];
  const contract = JSON.stringify(manifest, null, 2);
  // 校验 manifest:路径必须相对、无 ../绝对/~,且落在 src/|test/;模块数封顶。防恶意 manifest 逃逸/fork 炸弹。
  const MAXMODS = 12;
  const badPath = (p) => typeof p !== "string" || p.includes("..") || /^([a-zA-Z]:|[/\\~])/.test(p) || !/^(src|test)\//.test(p) || /[\x00-\x1f]/.test(p);
  if (mods.length > MAXMODS) { log(`✗ modules 数 ${mods.length} 超上限 ${MAXMODS}(fail-closed)`); process.exit(1); }
  for (const m of mods) if (badPath(m.file) || badPath(m.testFile)) { log(`✗ modules.json 非法路径(越界/绝对/非 src|test):${m.file} / ${m.testFile}(fail-closed)`); process.exit(1); }
  if (mods.length >= 2) {
    const CONC = 4; // 并发上限,防进程 fork 炸弹
    log(`狼群并行建 ${mods.length} 模块(并发≤${CONC})…`);
    const before = await hashTree(dir); // lane 强制:批次前快照
    const results = [];
    for (let i = 0; i < mods.length; i += CONC) {
      results.push(...await Promise.all(mods.slice(i, i + CONC).map((m) => gen(`狼群并行开发:你只负责建【${m.file}】+【${m.testFile}】,禁止创建/修改任何其他文件(防碰撞)。` +
      `Node ESM+node:test,按规格实现。完整契约(含他人接口,供对齐):\n${contract}\n你的模块:${JSON.stringify(m)}\n只回 DONE(流水线会跑测试)。`,
      dir))));
    }
    log(`  狼群返回 ${results.filter((r) => r.code === 0).length}/${mods.length} 成功`);
    // lane 强制:worker 只准碰自己契约的 file/testFile;越界(改 design/别人模块/新建契约外文件)即 fail-closed
    const allowed = new Set(mods.flatMap((m) => [m.file, m.testFile].map((p) => p.replace(/\\/g, "/"))));
    const after = await hashTree(dir);
    const offlane = [];
    for (const [p, h] of after) {
      if (allowed.has(p)) continue;
      if (!before.has(p)) offlane.push(`${p}(新建契约外文件)`);
      else if (before.get(p) !== h) offlane.push(`${p}(改动非本 lane 文件)`);
    }
    if (offlane.length) { log("✗ 狼群越界写(worker 触碰契约外文件),fail-closed:\n  " + offlane.join("\n  ")); process.exit(1); }
    log("  ✓ lane 强制通过(仅碰契约文件)");
    log("集成层…");
    const ig = await gen(`各模块已由狼群建好(见 modules.json)。写集成层 ${(manifest.integration?.files || ["src/app.mjs"]).join(", ")} 组合各模块 + 集成测试。${manifest.integration?.note || ""} 写完只回 DONE(流水线会跑测试)。`, dir);
    if (ig.code !== 0) { log(`✗ 集成 worker 失败 code=${ig.code},停机`); process.exit(1); }
  } else {
    log("单模块,直接实现");
    const ss = await gen(`按 ${hasDesign ? "design.md/tasks.md" : "需求:" + req} 实现全部代码与测试(Node ESM+node:test)。写完只回 DONE(流水线会跑测试)。`, dir);
    if (ss.code !== 0) { log(`✗ 实现 worker 失败 code=${ss.code},停机`); process.exit(1); }
  }
}

// 测试收敛环
async function stageTestloop(dir) {
  banner("测试收敛环");
  for (let i = 1; i <= 4; i++) {
    const r = await nodeTest(dir); const t = parseTest(r.out);
    log(`测试 R${i}: exit=${r.code} tests=${t.tests} pass=${t.pass} fail=${t.fail}`);
    if (r.code === 0 && t.fail === 0 && t.tests > 0) { log("✓ 测试环收敛"); return; }
    if (i === 4) { log("✗ 测试环未收敛,停机交人工"); process.exit(1); }
    await gen(`当前目录测试未通过,输出如下(修复实现或测试,不得删测试凑绿):\n${r.out.slice(-2500)}\n改完只回 DONE(流水线会复跑测试)。`, dir);
  }
}

async function main() {
  // 计算 positional(排除 flag 及其取值)
  const flagVals = new Set();
  if (has("--approve")) flagVals.add(flag("--approve"));
  const positionals = argv.filter((a) => !a.startsWith("--") && !flagVals.has(a));

  // --approve / --status 子命令
  if (has("--approve")) {
    if (!TOKEN) { console.error("✗ --approve 需设置 KB_ORCH_TOKEN(worker 环境已剥离该变量,故无法自我批准)"); process.exit(2); }
    const g = flag("--approve"); const dir = positionals[0] || "_orch-run"; const state = await loadState(dir);
    if (!state.approvals.includes(g)) state.approvals.push(g);
    await saveState(dir, state); log(`✓ 已预批 ${g}(目录 ${dir})。重跑主命令即续跑。`); return;
  }
  if (has("--status")) { const dir = positionals[0] || "_orch-run"; log("进度:", JSON.stringify(await loadState(dir), null, 2)); return; }

  const req = positionals[0]; const dir = positionals[1] || "_orch-run";
  if (!req) { console.error('用法: node orchestrator.mjs "<需求>" [目录]'); process.exit(2); }

  await mkdir(dir, { recursive: true });
  if (has("--impl-only")) { if (GATE_KEYWORDS.test(req)) { console.error("✗ 需求命中卡点关键词,禁用 --impl-only(会绕过闸/门禁),请走完整流水线"); process.exit(2); } log("[impl-only] 仅跑 分解→狼群→集成→测试环(不产可 ship 状态)"); await stageImplement(dir, req); await stageTestloop(dir); banner("[impl-only] 完成,产物在 " + dir); return; }
  const state = await loadState(dir);
  state.req = req; await saveState(dir, state);
  const done = (s) => state.done.includes(s);
  const mark = async (s) => { if (!done(s)) state.done.push(s); await saveState(dir, state); };
  const touches卡点 = GATE_KEYWORDS.test(req);
  const stageGates = async () => {
    banner("企业绝对门禁 G1-G4(fail-closed)");
    const results = [];
    const sg = await run("semgrep", ["--config", "auto", ".", "--error", "--quiet"], { cwd: dir, shell: true, timeout: 300_000, env: workerEnv() });
    results.push(["G1 SAST(semgrep)", sg.code === 0]);
    const sec = await run(process.execPath, ["-e", `const fs=require('fs');let hit=0;const walk=d=>{for(const e of fs.readdirSync(d,{withFileTypes:true})){if(e.name==='node_modules'||e.name==='.git')continue;const p=d+'/'+e.name;if(e.isDirectory())walk(p);else if(/\\.(mjs|js|ts|json|env|ya?ml|pem|key|sh|txt|cfg|conf|ini|toml)$/i.test(e.name)||/^\\.env/.test(e.name)){const t=fs.readFileSync(p,'utf8');if(/(api[_-]?key|secret|token|password|BEGIN [A-Z ]*PRIVATE KEY)\\s*[:=]?\\s*['\\"]?[A-Za-z0-9_\\-\\/+]{12,}/i.test(t))hit++}}};walk('.');process.exit(hit?1:0)`], { cwd: dir });
    results.push(["G3 secrets", sec.code === 0]);
    const cov = await run(process.execPath, ["--test", "--experimental-test-coverage"], { cwd: dir, timeout: 300_000 });
    const covLine = +(cov.out.match(/all files[^\n]*?\|\s*([\d.]+)/)?.[1] ?? 0);
    results.push([`G4 覆盖率(行 ${covLine}%>=70)`, cov.code === 0 && covLine >= 70]);
    for (const [n, ok] of results) log(`  ${ok ? "✓" : "✗"} ${n}`);
    return results.every(([, ok]) => ok);
  };

  log("需求:", req);
  log("目录:", dir);
  if (touches卡点) log("⚠ 需求命中卡点关键词 → 闸①/闸② 视为高风险,必须人工审批");

  // ── 前半:宪法→澄清→设计→计划→任务→Analyze(单次 claude 产全部工件)──
  if (!done("fronthalf")) {
    banner("前半 Stage0-3 + Analyze(claude -p 产工件)");
    const fh = await gen(`你是流水线的规划阶段。针对下述需求,在当前目录产出这些工件文件(Markdown),内容要具体可审:\n` +
    `- constitution.md：技术栈/工程红线/合规目标\n` +
    `- spec.md：功能需求FR + 非功能 + 验收；含"## Clarify 假设"(把模糊点列出并给出你采用的默认假设)与"## 需人工确认"(真正必须业务方拍板的点,没有就写"无")\n` +
    `- design.md：边界/IO契约/主链路/支线穷举/状态机\n` +
    `- plan.md + tasks.md：分层实施与可执行任务分解\n` +
    `- analyze.md：对以上工件做跨文件一致性检查,列出缺口(覆盖/矛盾/歧义残留),没有就写"一致"\n` +
    `全部用 Node 技术栈假设。完成后只回 DONE。\n需求：${req}`,
    dir,);
    if (fh.code !== 0) { log(`✗ 前半 worker 失败 code=${fh.code},停机`); process.exit(1); }
    for (const f of ["constitution.md", "spec.md", "design.md", "plan.md", "tasks.md"]) {
      if (!existsSync(join(dir, f)) || (await readFile(join(dir, f), "utf8")).trim().length < 50) { log(`✗ 前半工件缺失/过空:${f},停机`); process.exit(1); }
    }
    await mark("fronthalf");
  }

  // ── 闸①:架构确认(人工卡点)──
  if (!done("gate1")) {
    const spec = existsSync(join(dir, "spec.md")) ? await readFile(join(dir, "spec.md"), "utf8") : "";
    const mustAsk = /##\s*需人工确认[\s\S]*?(?=\n##|$)/.exec(spec)?.[0] || "";
    const ctx = `工件已产出(constitution/spec/design/plan/tasks/analyze.md 于 ${dir})。` +
      (touches卡点 ? " 需求命中卡点关键词。" : "") +
      (/[^无\s]/.test(mustAsk.replace(/##\s*需人工确认/, "")) ? `\n需人工确认项:\n${mustAsk}` : " 无必须业务确认项。");
    await humanGate("gate1", dir, state, ctx);
    await mark("gate1");
  }

  // ── 实现(狼群并行)──
  if (!done("implement")) { await stageImplement(dir, req); await mark("implement"); }

  // ── 测试收敛环 ──
  if (!done("testloop")) { await stageTestloop(dir); await mark("testloop"); }

  // ── 企业绝对门禁 G1-G4(fail-closed)──
  if (!done("gates")) { if (!(await stageGates())) { log("✗ 绝对门禁未过,停机交人工(不可豁免)"); process.exit(1); } await mark("gates"); }

  // ── 异构复审收敛环(需连续 2 轮 0 H/M；未达即 fail-closed,绝不进闸②)──
  if (!done("review")) {
    const maxRev = 6;
    banner(`异构复审收敛环(需连续 2 轮 0 H/M,上限 ${maxRev} 轮)`);
    let clean = 0, converged = false;
    for (let r = 1; r <= maxRev; r++) {
      const prompt = `只读安全+正确性复审(异构)。绝不跑命令。找测试可能漏掉的真问题。每条 H/M/L。**最后单独一行:VERDICT H=<高危> M=<中危>**。\n\n${await srcBundle(dir)}`;
      const rout = (await rev(prompt, dir)).out;
      const v = parseVerdict(rout);
      log(`复审 R${r}: VERDICT H=${v.H} M=${v.M}`);
      if (v.H === 0 && v.M === 0) {
        if (++clean >= 2) { log("✓ 连续 2 轮 0 H/M,复审收敛"); converged = true; break; }
        log(`  (第 ${clean} 轮干净,再确认一轮)`); continue;
      }
      clean = 0;
      if (v.H === -1) log("  ! 复审未给判定行,记未收敛");
      const findings = rout.split(/\n/).filter((l) => /High|Medium|严重|中危|风险|漏|H:|M:/i.test(l)).join("\n").slice(0, 4000);
      log("  → claude 按复审修 H/M…");
      await gen(`异构复审发现以下问题,在当前目录修复(保持所有测试通过,不得删测试):\n${findings}\n修完只回 DONE(流水线会跑回归)。`, dir);
      const rr = await nodeTest(dir); const rt = parseTest(rr.out);
      log(`  回归: exit=${rr.code} tests=${rt.tests} pass=${rt.pass} fail=${rt.fail}`);
      if (rr.code !== 0 || rt.fail > 0 || rt.tests < 1) { log("✗ 修复引入回归/无有效测试,停机交人工"); process.exit(1); }
    }
    if (!converged) { log(`✗ ${maxRev} 轮内未达连续 2 轮 0 H/M(fail-closed,不进闸②),停机交人工`); process.exit(1); }
    await mark("review");
  }

  // ── 复审改码后重跑绝对门(H4:review 的修复可能引入 secret/降覆盖/危险码)──
  if (!done("finalgate")) { banner("复审后重跑绝对门(改码回归)"); if (!(await stageGates())) { log("✗ 复审改码后绝对门回归失败,停机交人工"); process.exit(1); } await mark("finalgate"); }

  // ── 闸②:推送/部署(人工卡点)──
  if (!done("gate2")) {
    await humanGate("gate2", dir, state, `开发环已收敛(测试绿 + G1-G4 过 + 异构复审连续2轮0H/M)。产物在 ${dir}。闸②=推送/部署,需人工审批,不自动 ship。`);
    await mark("gate2");
  }
  banner("✅ 全流水线完成(闸②已放行)。产物在:" + dir);
}
main().catch((e) => { console.error("[orch] 崩溃:", e); process.exit(1); });
