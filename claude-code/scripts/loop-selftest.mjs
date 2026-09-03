#!/usr/bin/env node
// loop-selftest —— autoresearch-loop 承重纯函数的对抗性单测（#2）。
// 用法：node ~/.claude/scripts/loop-selftest.mjs   退出码：全过 0 / 任一失败 1。
//
// 为什么用「读源码切片 + eval」而非 import：
//   autoresearch-loop.mjs 是 Workflow 脚本（顶层 return + export meta + 依赖 agent/parallel/budget 运行时全局），
//   运行时把整体包进 async 函数执行 → 不能被普通 import。故本测试**从真实源文件抽出纯函数区段**（isGated / dedup /
//   evidenceConsistent / fpEqual 等）注入测试作用域运行——测的是真源码而非副本；抽取锚点若因重构失配会当场报错提示。
//
// 覆盖范围（诚实声明，不假装）：
//   ✅ 覆盖：isGated（漏卡点 / origFile 保原始大小写）、evidenceConsistent（证据糊弄）、fpEqual/fpOf（越界指纹/永不假收敛核心）、
//           dedup（L 不得盖 H）、normPath/relToRepo、groupByFile、computeRegressed（9 分支回退判定，假收敛第一道闸）、
//           validReviews（quorum 反伪造）、computeUncovered（COVGAP 每文件×每视角）、computeTouched/computeOutside（越界集合运算）、
//           computeTrusted（可信派生）、nextTrusted（ratchet 非单调：回退轮不抬升 lastTrusted*）。
//   ❌ 未覆盖（诚实全列，勿以为缺口已尽知）：statMap 无直接单测（其元件 fpOf/fpEqual 已测）、主循环调用点的多变量状态接线
//           （集成路径，非独立纯函数）、.sh 侧 bash 回退/收敛数学（独立实现——happy-path CONVERGED 已由 loop-codex-test.sh [3a]
//           端到端确定性覆盖，回退分支未单测；mjs 侧 computeRegressed 已 9 分支全测）。

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = join(homedir(), ".claude");
const LOOP = join(BASE, "workflows", "autoresearch-loop.mjs");
const src = readFileSync(LOOP, "utf8");

let failures = 0;
const out = (s) => process.stdout.write(s + "\n");
function check(name, fn) {
  try { fn(); out(`  ✅ ${name}`); }
  catch (e) { failures++; out(`  ❌ ${name}\n       ${e.message}`); }
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg || "断言失败"}：期望 ${b}，实得 ${a}`);
}
function truthy(v, msg) { if (!v) throw new Error(msg || `期望真值，实得 ${JSON.stringify(v)}`); }
function falsy(v, msg) { if (v) throw new Error(msg || `期望假值，实得 ${JSON.stringify(v)}`); }

// ---- 从真实源码抽取纯函数区段 ----
function slice(startAnchor, endAnchor, label) {
  const s = src.indexOf(startAnchor);
  if (s < 0) throw new Error(`抽取失败：找不到起始锚点「${startAnchor}」(${label})——loop 源码结构已变，请更新本测试`);
  const e = src.indexOf(endAnchor, s);
  if (e < 0) throw new Error(`抽取失败：找不到结束锚点「${endAnchor}」(${label})`);
  return src.slice(s, e);
}
const gateSrc   = slice("const GATE_STRONG", "\n// ---- JSON Schema", "GATE 区段");    // GATE_* + isGated
const helperSrc = slice("const SEV_RANK", "\nasync function runVerify", "helper 区段"); // SEV_RANK..evidenceConsistent
const fpSrc     = slice("const fpOf =", "\n// ---- 主循环", "指纹 区段");               // fpOf..UNTRACKED_FP

// 工厂：以给定的运行时常量（repo/expectTests/caseSensitivePaths）实例化纯函数命名空间。
function loadLib(repo = ".", expectTests = true, caseSensitivePaths = false) {
  const prelude = `const repo=${JSON.stringify(repo)}; const expectTests=${expectTests}; const caseSensitivePaths=${caseSensitivePaths};`;
  const ret = `\n; return { isGated, dedup, groupByFile, evidenceConsistent, normPath, relToRepo, fpOf, fpEqual, statMap, UNTRACKED_FP, SEV_RANK, computeRegressed, validReviews, computeUncovered, computeTouched, computeOutside, computeTrusted, nextTrusted };`;
  // helperSrc 定义 normPath（fpSrc.statMap 需要）；gateSrc 自包含；fpSrc 用 normPath → 顺序 helper→gate→fp。
  return new Function(`${prelude}\n${helperSrc}\n${gateSrc}\n${fpSrc}${ret}`)();
}

const lib = loadLib(".", true, false);
const libNoTest = loadLib(".", false, false);
const libProj = loadLib("proj", true, false);

out("\n=== autoresearch-loop 纯函数自测 ===\n");

// ---- isGated：漏卡点是致命的（false negative）；误 gate 是噪音（false positive）----
out("[1] isGated —— 人工卡点命中/放行（对齐 human-gate.md 设计要点）");
const g = (f) => lib.isGated(f);
// 必须 gate（命中即整 loop STOP 交人工）
check("ALTER TABLE + .sql 路径 → gate", () => truthy(g({ title: "加个 ALTER TABLE users", file: "db/x.sql" })));
check("大写 UPDATE...WHERE → gate（批量 DML）", () => truthy(g({ title: "batch UPDATE orders SET n=1 WHERE id>0", file: "a.js" })));
check("SELECT SUM( 聚合 → gate", () => truthy(g({ title: "SELECT SUM(amount) FROM t", file: "a.js" })));
check("PaymentService 驼峰 → gate", () => truthy(g({ title: "refactor PaymentService", file: "a.js" })));
check("accountBalance → gate（财务 balance）", () => truthy(g({ title: "fix accountBalance calc", file: "a.js" })));
check("balance sheet → gate", () => truthy(g({ title: "improve balance sheet export", file: "a.js" })));
check("中文 余额 → gate", () => truthy(g({ title: "余额显示错误", file: "a.js" })));
check("反斜杠 schema 路径 → gate（归一后命中，不依赖调用方预归一）", () => truthy(g({ title: "x", detail: "y", file: "db\\schema\\core" })));
check("反斜杠+大写迁移路径 → gate（GATE_PATH /i + 归一）", () => truthy(g({ title: "x", detail: "y", file: "DB\\MIGRATIONS\\CORE" })));
check("中文 金额/汇总 → gate", () => truthy(g({ title: "金额汇总口径", file: "a.js" })));
check("UserDTO → gate", () => truthy(g({ title: "update UserDTO field", file: "a.js" })));
check("contract 路径 → gate", () => truthy(g({ title: "tweak api", file: "src/contracts/user.proto" })));
check("migrations 路径 → gate", () => truthy(g({ title: "seed", file: "db/migrations/001_init.js" })));
check("docker-compose 路径 → gate", () => truthy(g({ title: "bump image", file: "docker-compose.yml" })));
// 必须放行（储能/IoT 域高频误 gate，放行是关键正确性）
check("cellBalance → 放行（电芯均衡非财务）", () => falsy(g({ title: "fix cellBalance in BMS", file: "bms.ts" })));
check("loadBalancer → 放行", () => falsy(g({ title: "tune loadBalancer weights", file: "lb.ts" })));
check("rebalance → 放行", () => falsy(g({ title: "rebalance shards", file: "shard.ts" })));
check("SERVO 大写词内 VO → 放行", () => falsy(g({ title: "SERVO motor pid", file: "servo.ts" })));
check("INVOKE 大写词内 VO → 放行", () => falsy(g({ title: "INVOKE the handler", file: "h.ts" })));
check("items.count() 无 SELECT 上下文 → 放行", () => falsy(g({ title: "items.count() returns 0", file: "a.ts" })));
check("小写 update...where 散文 → 放行", () => falsy(g({ title: "update the readme where needed", file: "README.md" })));
check("contract 仅在标题非路径 → 放行（杀 arch 视角 FP）", () => falsy(g({ title: "respect the contract between layers", file: "src/service.ts" })));
check("codex H1: origFile 保原始大小写 → camel PaymentService 命中（file 已小写化也不漏）", () => truthy(g({ title: "rounding bug", detail: "", file: "src/paymentservice.ts", origFile: "src/PaymentService.ts" })));
check("codex H1: UserDTO 仅在 origFile → 命中", () => truthy(g({ title: "tweak", detail: "", file: "src/userdto.ts", origFile: "src/UserDTO.ts" })));
check("codex M2: contract 写路径（仅 file）复用 isGated → 命中", () => truthy(g({ title: "", detail: "", file: "src/contracts/api.proto", origFile: "src/contracts/api.proto" })));

// ---- evidenceConsistent：证据糊弄检测（哨兵整行 + 三元组交叉校验）----
out("[2] evidenceConsistent —— 证据交叉校验");
const okEv = { testStat: "55/0/0", testPass: 55, testTotal: 55, testGreen: true, evidence: "git ok\nTEST_STAT: 55/0/0\n", diffFiles: 2, changedStat: [{}, {}] };
check("完全一致 → true", () => truthy(lib.evidenceConsistent(okEv)));
check("哨兵行与 testStat 不符 → false", () => falsy(lib.evidenceConsistent({ ...okEv, evidence: "TEST_STAT: 54/0/0" })));
check("配了测试却报 N/A → false（跳测试蒙混）", () => falsy(lib.evidenceConsistent({ ...okEv, testStat: "N/A", evidence: "TEST_STAT: N/A" })));
check("testGreen 但 fail>0 → false", () => falsy(lib.evidenceConsistent({ testStat: "55/2/0", testPass: 55, testTotal: 57, testGreen: true, evidence: "TEST_STAT: 55/2/0", diffFiles: 0, changedStat: [] })));
check("testPass 与哨兵三元组不符 → false", () => falsy(lib.evidenceConsistent({ ...okEv, testPass: 50 })));
check("changedStat 长度≠diffFiles → false（门禁完整性）", () => falsy(lib.evidenceConsistent({ ...okEv, diffFiles: 3 })));
check("testStat 为空 → false", () => falsy(lib.evidenceConsistent({ ...okEv, testStat: "" })));
check("无测试命令时 N/A 合法 → true", () => truthy(libNoTest.evidenceConsistent({ testStat: "N/A", testPass: -1, testTotal: -1, testGreen: true, evidence: "仅 diff\nTEST_STAT: N/A", diffFiles: 1, changedStat: [{}] })));

// ---- fpEqual/fpOf：越界指纹 / 永不假收敛核心 ----
out("[3] fpEqual —— 内容哈希指纹比对（越界检测地基）");
check("同 sha → 相等（未触动）", () => truthy(lib.fpEqual({ sha: "abc", ln: "5/3" }, { sha: "abc", ln: "9/9" })));
check("异 sha 同增删行数 → 不等（抓原地改写）", () => falsy(lib.fpEqual({ sha: "abc", ln: "5/3" }, { sha: "xyz", ln: "5/3" })));
check("一侧缺失 → 不等（新增/消失=触动）", () => falsy(lib.fpEqual({ sha: "abc", ln: "5/3" }, undefined)));
check("两侧无 sha 同行数 → 相等（回落行数比）", () => truthy(lib.fpEqual({ sha: null, ln: "5/3" }, { sha: null, ln: "5/3" })));
check("两侧无 sha 异行数 → 不等", () => falsy(lib.fpEqual({ sha: null, ln: "5/3" }, { sha: null, ln: "6/3" })));
check("一侧有 sha 一侧无 → 回落行数比（不跨格式误判）", () => truthy(lib.fpEqual({ sha: "abc", ln: "5/3" }, { sha: null, ln: "5/3" })));
check("两侧皆空 → 相等", () => truthy(lib.fpEqual(undefined, undefined)));
check("fpOf 无 sha 时 sha=null ln=增/删", () => eq(lib.fpOf({ added: 5, deleted: 3 }), { sha: null, ln: "5/3" }));
check("fpOf 有 sha 时保留 sha", () => eq(lib.fpOf({ added: 1, deleted: 0, sha: "deadbeef" }), { sha: "deadbeef", ln: "1/0" }));

// ---- dedup：L 级绝不得盖过 H/M（防假收敛）----
out("[4] dedup —— 同问题保留最高 severity + 合并 detail");
check("L 后 H 同 key → 保留 H", () => {
  const r = lib.dedup([{ file: "a.ts", title: "空指针", line: 1, severity: "L", detail: "x" }, { file: "a.ts", title: "空指针", line: 1, severity: "H", detail: "y" }]);
  eq(r.length, 1, "应去重为 1 条");
  eq(r[0].severity, "H", "应保留最高 severity H");
  truthy(r[0].detail.includes("x") && r[0].detail.includes("y"), "detail 应合并两侧");
});
check("不同 key 不去重", () => eq(lib.dedup([{ file: "a", title: "t1", line: 1, severity: "H" }, { file: "b", title: "t2", line: 2, severity: "M" }]).length, 2));
check("H 先 L 后 同 key → 仍保留 H（L 不得降级）", () => {
  const r = lib.dedup([{ file: "a.ts", title: "空指针", line: 1, severity: "H", detail: "x" }, { file: "a.ts", title: "空指针", line: 1, severity: "L", detail: "y" }]);
  eq(r.length, 1, "应去重为 1 条"); eq(r[0].severity, "H", "H 先到，L 不得降级");
});
check("同 detail 二次不重复追加", () => {
  const r = lib.dedup([{ file: "a", title: "t", line: 1, severity: "M", detail: "dup" }, { file: "a", title: "t", line: 1, severity: "M", detail: "dup" }]);
  eq(r.length, 1); eq((r[0].detail.match(/dup/g) || []).length, 1, "重复 detail 不应追加两次");
});

// ---- normPath / relToRepo：路径归一 + 剥仓库前缀 ----
out("[5] normPath / relToRepo —— 路径归一与前缀剥离");
check("反斜杠→正斜杠 + 大小写不敏感归一", () => eq(lib.normPath("./Foo\\Bar.TS"), "foo/bar.ts"));
check("caseSensitive=true 保留大小写", () => eq(loadLib(".", true, true).normPath("./Foo/Bar.TS"), "Foo/Bar.TS"));
check("relToRepo 剥掉 repo 前缀（repo=proj）", () => eq(libProj.relToRepo("proj/src/a.ts"), "src/a.ts"));
check("relToRepo repo='.' 时为归一恒等", () => eq(lib.relToRepo("src/a.ts"), "src/a.ts"));

// ---- groupByFile ----
out("[6] groupByFile —— 按文件聚合");
check("同文件多 finding 聚为一组", () => {
  const r = lib.groupByFile([{ file: "a", title: "1" }, { file: "a", title: "2" }, { file: "b", title: "3" }]);
  eq(r.length, 2, "应聚成 2 组");
  eq(r.find(x => x.file === "a").items.length, 2, "a 组应含 2 条");
});

// ---- computeRegressed：假收敛第一道闸（9 分支 OR，逐分支隔离 + 恢复不误判）----
out("[7] computeRegressed —— 回退检测 9 分支");
const base = { baselineGreen: true, testGreen: true, baselinePass: 55, testPass: 55, baselineTotal: 55, testTotal: 55, lastTrustedPass: 55, lastTrustedTotal: 55, baselineFE: 0, curFE: 0, lastTrustedFE: 0, lastTrustedGreen: true };
check("无回退（全持平）→ false", () => falsy(lib.computeRegressed(base)));
check("①基线绿→本轮红 → true", () => truthy(lib.computeRegressed({ ...base, testGreen: false, lastTrustedGreen: false })));
check("②pass 较基线下降 → true", () => truthy(lib.computeRegressed({ ...base, testPass: 54, lastTrustedPass: 54, baselineFE: 1, lastTrustedFE: 1, curFE: 1 })));
check("③total 较基线下降（删测试）→ true", () => truthy(lib.computeRegressed({ ...base, testTotal: 54, lastTrustedTotal: 54 })));
check("④pass 较可信轮下降（高于基线也抓）→ true", () => truthy(lib.computeRegressed({ ...base, baselinePass: 50, testPass: 52, lastTrustedPass: 55, baselineFE: 5, lastTrustedFE: 5, curFE: 3 })));
check("⑤total 较可信轮下降 → true", () => truthy(lib.computeRegressed({ ...base, baselineTotal: 50, testTotal: 52, lastTrustedTotal: 55 })));
check("⑥FE 较基线增加 → true", () => truthy(lib.computeRegressed({ ...base, baselineFE: 0, curFE: 2, lastTrustedFE: 2 })));
check("⑦FE 较可信轮增加 → true", () => truthy(lib.computeRegressed({ ...base, baselineFE: 5, curFE: 3, lastTrustedFE: 1 })));
check("⑧可信绿→本轮红 → true", () => truthy(lib.computeRegressed({ ...base, baselineGreen: false, lastTrustedGreen: true, testGreen: false })));
check("⑨红且计数不可解析(testPass<0) → 保守 true", () => truthy(lib.computeRegressed({ ...base, baselineGreen: false, lastTrustedGreen: false, testGreen: false, testPass: -1 })));
check("红基线恢复(pass 升过基线)不误判回退 → false", () => falsy(lib.computeRegressed({ ...base, baselineGreen: false, testGreen: true, baselinePass: 50, testPass: 55, lastTrustedPass: 55, baselineFE: 5, curFE: 0, lastTrustedFE: 0 })));

// ---- validReviews / computeUncovered：quorum 反伪造 + COVGAP ----
out("[8] validReviews / computeUncovered —— quorum 反伪造 + COVGAP");
const cset = new Set(["src/a.ts", "src/b.ts"]);
check("空 reviewedFiles → 不算有效视角", () => eq(lib.validReviews([{ reviewedFiles: [], findings: [] }], cset).length, 0));
check("reviewedFiles 全无关 → 不算有效（防伪造 quorum）", () => eq(lib.validReviews([{ reviewedFiles: ["zzz/none.ts"], findings: [] }], cset).length, 0));
check("reviewedFiles ∩ 改动集非空 → 有效", () => eq(lib.validReviews([{ reviewedFiles: ["src/a.ts"], findings: [] }], cset).length, 1));
check("null review 被剔除", () => eq(lib.validReviews([null, { reviewedFiles: ["src/a.ts"] }], cset).length, 1));
check("COVGAP：某文件漏某视角 → 列为缺审", () => eq(lib.computeUncovered(new Set(["src/a.ts", "src/b.ts"]), [{ reviewedFiles: ["src/a.ts", "src/b.ts"] }, { reviewedFiles: ["src/a.ts"] }]), ["src/b.ts"]));
check("COVGAP：每视角都审全 → 无缺审", () => eq(lib.computeUncovered(new Set(["src/a.ts"]), [{ reviewedFiles: ["src/a.ts"] }, { reviewedFiles: ["src/a.ts"] }]).length, 0));
check("codex H2: repo=proj 带前缀 reviewedFiles 仍算有效视角", () => eq(libProj.validReviews([{ reviewedFiles: ["proj/src/a.ts"], findings: [] }], new Set(["src/a.ts"])).length, 1));
check("codex H2: repo=proj COVGAP 带前缀 reviewedFiles 覆盖 → 无缺审", () => eq(libProj.computeUncovered(new Set(["src/a.ts"]), [{ reviewedFiles: ["proj/src/a.ts"] }]).length, 0));

// ---- computeTouched / computeOutside：指纹越界检测（永不假收敛核心）----
out("[9] computeTouched / computeOutside —— 指纹触动 + 越界");
const P = (m) => new Map(Object.entries(m).map(([k, v]) => [k, lib.fpOf(v)]));
check("同 sha 未触动 → 不在 touched", () => eq(lib.computeTouched(P({ "a.ts": { added: 1, deleted: 0, sha: "x" } }), P({ "a.ts": { added: 9, deleted: 9, sha: "x" } })).length, 0));
check("sha 变（同增删行数原地改写）→ 触动", () => eq(lib.computeTouched(P({ "a.ts": { added: 1, deleted: 0, sha: "x" } }), P({ "a.ts": { added: 1, deleted: 0, sha: "y" } })), ["a.ts"]));
check("新增文件 → 触动", () => eq(lib.computeTouched(new Map(), P({ "new.ts": { added: 3, deleted: 0, sha: "z" } })), ["new.ts"]));
check("computeOutside：触动但不在分配集 → 越界", () => eq(lib.computeOutside(["a.ts", "b.ts"], new Set(["a.ts"])), ["b.ts"]));
check("computeOutside：全在分配集 → 无越界", () => eq(lib.computeOutside(["a.ts"], new Set(["a.ts"])).length, 0));

// ---- computeTrusted / nextTrusted：可信判定 + ratchet 非单调 ----
out("[10] computeTrusted / nextTrusted —— 可信 + ratchet 防误判");
check("交叉校验过+无归属错+已落盘 → trusted", () => truthy(lib.computeTrusted({ evidenceOk: true, misowned: 0, actuallyChanged: 2, diffFiles: 2 })));
check("misowned>0 → 不可信", () => falsy(lib.computeTrusted({ evidenceOk: true, misowned: 1, actuallyChanged: 0, diffFiles: 0 })));
check("自报已改却 diff=0 → 不可信", () => falsy(lib.computeTrusted({ evidenceOk: true, misowned: 0, actuallyChanged: 3, diffFiles: 0 })));
check("evidenceOk=false → 不可信", () => falsy(lib.computeTrusted({ evidenceOk: false, misowned: 0, actuallyChanged: 0, diffFiles: 0 })));
const prevT = { lastTrustedPass: 55, lastTrustedTotal: 55, lastTrustedGreen: true, lastTrustedFE: 0 };
check("ratchet：回退轮不抬升（原样返回）", () => eq(lib.nextTrusted(prevT, { testPass: 99, testTotal: 99, testGreen: true, curFE: 0 }, true), prevT));
check("ratchet：未回退轮 pass 抬升 55→60", () => eq(lib.nextTrusted(prevT, { testPass: 60, testTotal: 60, testGreen: true, curFE: 0 }, false).lastTrustedPass, 60));
check("ratchet：未回退但 pass 更低不下调（Math.max）", () => eq(lib.nextTrusted(prevT, { testPass: 50, testTotal: 55, testGreen: true, curFE: 5 }, false).lastTrustedPass, 55));

out("");
if (failures === 0) out("✅ 全部通过（承重纯函数）。");
else out(`❌ ${failures} 项失败 —— 见上。`);
process.exit(failures === 0 ? 0 : 1);
