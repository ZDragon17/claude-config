#!/usr/bin/env node
// 配置自检 harness —— 把"loop engineering 是否真在跑"变成可复跑的命令。
// 用法：node ~/.claude/scripts/verify-config.mjs   （配置改动后跑一遍）
// 退出码：全过 0，任一失败 1。
//
// 覆盖（确定性、可静态/子进程验证的部分）：
//   1. settings.json 合法 + danger-gate 在 PreToolUse 最前 + context-guard 在 PostToolUse
//   2. settings.json 引用的所有 .mjs hook 存在且 node --check 通过
//   3. CLAUDE.md 的 @import 目标全部存在
//   4. 每条 alwaysApply:true 规则都被 @import（无"声称常驻却没加载"的假信号）
//   5. agents/ 的 name 全部唯一（无路由冲突）
//   6. danger-gate 行为矩阵：危险命令 exit 2、安全命令 exit 0
//   7. 无死配置：ecc-hooks.json 不存在；rules 里无已失效的 TeamCreate/TeamDelete/SendMessage 工具名
//   8. loop 卡点正则三处同步：GATE_* 在 .mjs 与 .sh 逐条 source+flags 等价、每个 gate 都被 isGated 接线、
//      human-gate.md 仍声明「改一处必改三处」铁律（把散文纪律升级成机器门禁）
//   9. ultrawork v2 流水线仍以 autoresearch-loop 为收敛内核 + human-gate 卡点 + 引用的 references/templates 齐全（防升级丢弃 loop 能力）
//
// 需真实 CC 会话才能验的部分（本 harness 不覆盖，末尾打印手动清单）：
//   - 规则是否真进上下文（新会话问 user-profile/human-gate）
//   - danger-gate 在真实会话里触发（让 CC 跑一条高危命令看是否被拦）
//   - 一轮 autoresearch 端到端自收敛

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = join(homedir(), ".claude");
const R = (p) => join(BASE, p);
let failures = 0;
const log = (s) => process.stdout.write(s + "\n");
function check(name, fn) {
  try {
    const detail = fn();
    log(`  ✓ ${name}${detail ? " — " + detail : ""}`);
  } catch (e) {
    failures++;
    log(`  ✗ ${name} — ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

log("\n=== ~/.claude 配置自检 ===\n");

// ---- 1 & 2. settings.json + hooks ----
log("[1] settings.json 与 hooks");
let settings;
const hookScripts = new Set();
check("settings.json 合法 JSON", () => {
  settings = JSON.parse(readFileSync(R("settings.json"), "utf8"));
  return `effortLevel=${settings.effortLevel}`;
});
check("danger-gate 在 PreToolUse 最前（确定性安全闸）", () => {
  const pre = settings.hooks.PreToolUse;
  const first = pre?.[0]?.hooks?.[0]?.command || "";
  assert(first.includes("danger-gate.mjs"), "PreToolUse 第一个 hook 不是 danger-gate.mjs");
});
check("context-degradation-guard 在 PostToolUse", () => {
  const post = JSON.stringify(settings.hooks.PostToolUse || []);
  assert(post.includes("context-degradation-guard.mjs"), "PostToolUse 未挂 context-degradation-guard");
});
check("所有 .mjs hook 存在且语法通过", () => {
  for (const ev of Object.values(settings.hooks)) {
    for (const m of ev) for (const h of m.hooks || []) {
      const mm = (h.command || "").match(/node\s+"([^"]+\.mjs)"/);
      if (mm) hookScripts.add(mm[1]);
    }
  }
  const bad = [];
  for (const p of hookScripts) {
    if (!existsSync(p)) { bad.push(`缺失 ${p}`); continue; }
    const r = spawnSync("node", ["--check", p], { encoding: "utf8" });
    if (r.status !== 0) bad.push(`语法错 ${p}`);
  }
  assert(bad.length === 0, bad.join("; "));
  return `${hookScripts.size} 个脚本`;
});

// ---- 3 & 4. CLAUDE.md @import + alwaysApply 一致性 ----
log("[2] 规则加载（@import 与 alwaysApply 一致性）");
const claudeMd = readFileSync(R("CLAUDE.md"), "utf8");
const imports = [...claudeMd.matchAll(/^@(\S+)/gm)].map((m) => m[1]);
check("CLAUDE.md @import 目标全部存在", () => {
  const miss = imports.filter((i) => !existsSync(join(BASE, i)));
  assert(miss.length === 0, `缺失：${miss.join(", ")}`);
  return `${imports.length} 个 import`;
});
check("每条 alwaysApply:true 规则都被 @import（无假信号）", () => {
  const importedSet = new Set(imports.map((i) => i.replace(/^rules\//, "")));
  const rulesDir = R("rules");
  const orphan = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".md"))
    .filter((f) => /alwaysApply:\s*true/.test(readFileSync(join(rulesDir, f), "utf8")))
    .filter((f) => !importedSet.has(f));
  assert(orphan.length === 0, `标 alwaysApply:true 却未 @import：${orphan.join(", ")}`);
});

// ---- 5. agents name 唯一 ----
log("[3] agents 路由");
check("agents/ 的 name 全部唯一", () => {
  const dir = R("agents");
  const names = {};
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const nm = (readFileSync(join(dir, f), "utf8").match(/^name:\s*(.+)$/m) || [])[1]?.trim() || f;
    (names[nm] ||= []).push(f);
  }
  const dup = Object.entries(names).filter(([, v]) => v.length > 1);
  assert(dup.length === 0, `重名：${dup.map(([n, v]) => `${n}(${v.join("/")})`).join("; ")}`);
  return `${readdirSync(dir).filter((f) => f.endsWith(".md")).length} 个 agent`;
});

// ---- 6. danger-gate 行为矩阵 ----
log("[4] danger-gate 行为矩阵");
check("危险命令拦截 / 安全命令放行", () => {
  const gate = R(join("scripts", "hooks", "danger-gate.mjs"));
  const cases = [
    ["mysql -e \"DROP TABLE users\"", 2],
    ["echo ok && rm -rf /", 2],
    ["cat x && psql -c \"DROP TABLE t\"", 2],
    ["mysql prod < dump.sql", 2],
    ["psql -f migration.sql", 2],
    ["Remove-Item -Recurse -Force C:/x", 2],
    ["UPDATE t SET a=1; SELECT 1 WHERE id=1", 2],
    ["rm --recursive --force /", 2],
    ["flyway migrate", 2],
    ["git status", 0],
    ["grep \"DROP TABLE\" schema.sql", 0],
    ["mysql -e \"UPDATE t SET a=1 WHERE id=5\"", 0],
    ["rm -rf node_modules", 0],
    ["mysql -e \"DROP TABLE t\" # 已知风险", 0],
    ["npm run build", 0],
  ];
  const bad = [];
  for (const [cmd, exp] of cases) {
    const r = spawnSync("node", [gate], {
      input: JSON.stringify({ tool_name: "Bash", tool_input: { command: cmd } }),
      encoding: "utf8",
    });
    if (r.status !== exp) bad.push(`期望${exp}得${r.status}：${cmd.slice(0, 40)}`);
  }
  assert(bad.length === 0, bad.join(" | "));
  return `${cases.length} 用例全过`;
});

// ---- 7. 无死配置 ----
log("[5] 死配置 / 漂移");
check("ecc-hooks.json 已删除", () => assert(!existsSync(R("ecc-hooks.json")), "ecc-hooks.json 仍存在"));
check("rules 无失效 Team 工具名（TeamCreate/TeamDelete/SendMessage）", () => {
  const dir = R("rules");
  const hits = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const t = readFileSync(join(dir, f), "utf8");
    if (/\bTeamCreate\b|\bTeamDelete\b|\bSendMessage\s*\(/.test(t)) hits.push(f);
  }
  assert(hits.length === 0, `仍引用旧工具名：${hits.join(", ")}`);
});

// ---- 8. loop 卡点正则三处同步（human-gate「改一处必改三处」铁律的机器强制）----
log("[6] loop 卡点同步（GATE_* 正则 + isGated 行为三处一致性）");
function gatesOf(relPath) {
  const s = readFileSync(R(relPath), "utf8");
  const start = s.indexOf("const GATE_STRONG");
  const isGatedAt = s.indexOf("const isGated", start);
  assert(start >= 0 && isGatedAt > start, `${relPath} 未定位到 GATE 区段（源码结构变更？）`);
  const region = s.slice(start, isGatedAt);
  const names = [...region.matchAll(/const (GATE_[A-Z_]+)\s*=/g)].map((m) => m[1]);
  assert(names.length > 0, `${relPath} 未解析到 GATE_* 定义`);
  // 抽真源码 eval 出编译后 {source,flags}——比编译结果而非文本，跨注释/空白差异仍能测出真分歧
  const gates = new Function(region + "\n; return {" + names.map((n) => `${n}:{source:${n}.source,flags:${n}.flags}`).join(",") + "};")();
  // isGated 函数体：花括号配平抽取（取代脆弱定长窗口；模板 ${} 内外平衡故不误计）
  const braceOpen = s.indexOf("{", isGatedAt);
  let depth = 0, braceEnd = -1;
  for (let i = braceOpen; i < s.length; i++) { const c = s[i]; if (c === "{") depth++; else if (c === "}" && --depth === 0) { braceEnd = i + 1; break; } }
  assert(braceOpen > isGatedAt && braceEnd > braceOpen, `${relPath} isGated 函数体未闭合`);
  const isGatedSrc = s.slice(isGatedAt, braceEnd);
  const referenced = new Set([...isGatedSrc.replace(/\/\/[^\n]*/g, "").matchAll(/GATE_[A-Z_]+/g)].map((m) => m[0]));   // 先剥行注释再扫，避免注释里的 GATE_ 冒充"已接线"（codex L1）
  // 行为等价用：从编译后 gates 重建 GATE_*（干净，不含 .sh 的 SEV/ci/norm）+ 注入统一 normalizer
  // （两实现 path 归一语义一致、大小写被 GATE_PATH/CONTRACT_PATH 的 /i 吸收，中和 norm/normPath 命名与大小写差异）
  // → 只比 isGated 的**组合逻辑**（哪些正则、text vs path 路由）。
  const gateDecls = names.map((n) => `const ${n}=new RegExp(${JSON.stringify(gates[n].source)},${JSON.stringify(gates[n].flags)});`).join("\n");
  const inject = `const __n=p=>String(p||'').replace(/\\\\/g,'/').replace(/^\\.\\//,'').replace(/^\\/+/,'').trim();const norm=__n,normPath=__n;`;
  const isGated = new Function(gateDecls + "\n" + inject + "\n" + isGatedSrc + "\n; return isGated;")();
  return { names, gates, referenced, isGated };
}
check("GATE_* 正则 .mjs ↔ .sh 逐条等价（source+flags）", () => {
  const a = gatesOf("workflows/autoresearch-loop.mjs");
  const b = gatesOf("scripts/autoresearch-loop.sh");
  assert(a.names.slice().sort().join(",") === b.names.slice().sort().join(","),
    `GATE 名集不一致：mjs=[${a.names}] sh=[${b.names}]`);
  for (const n of a.names) {
    assert(a.gates[n].source === b.gates[n].source, `${n} source 分歧：\n  mjs: ${a.gates[n].source}\n  sh : ${b.gates[n].source}`);
    assert(a.gates[n].flags === b.gates[n].flags, `${n} flags 分歧：mjs='${a.gates[n].flags}' sh='${b.gates[n].flags}'`);
  }
});
check("isGated 行为等价 .mjs ↔ .sh（复现运行时调用约定 + 两 ci 模式 + 仅文件名命中语料）", () => {
  const a = gatesOf("workflows/autoresearch-loop.mjs");
  const b = gatesOf("scripts/autoresearch-loop.sh");
  const corpus = [
    { title: "ALTER TABLE x", detail: "", file: "a.js" },
    { title: "batch", detail: "UPDATE t SET x=1 WHERE id>0", file: "a.js" },
    { title: "x", detail: "y", file: "db\\schema\\core" },          // 反斜杠+无.sql：暴露 raw-vs-norm 路由分歧的关键语料
    { title: "x", detail: "y", file: "db\\migrations\\001.sql" },   // 反斜杠+.sql（.sql$ 分支）
    { title: "x", detail: "y", file: "DB/MIGRATIONS/CORE.SQL" },    // 大写
    { title: "x", detail: "y", file: "./src/contracts/a.proto" },   // ./ 前缀
    { title: "respect the contract between layers", detail: "", file: "src/service.ts" }, // contract 仅标题→放行
    { title: "fix accountBalance", detail: "", file: "a.js" },
    { title: "fix cellBalance in bms", detail: "", file: "bms.ts" },
    { title: "refactor PaymentService", detail: "", file: "a.js" },
    { title: "update UserDTO", detail: "", file: "a.js" },
    { title: "余额显示错误", detail: "", file: "a.js" },
    { title: "bump image", detail: "", file: "docker-compose.yml" },
    { title: "items.count() is 0", detail: "", file: "a.ts" },
    { title: "tune loadBalancer", detail: "", file: "lb.ts" },
    // 关键：gated 驼峰/缩写词**只**在 file 字段、title/detail 干净——暴露「调用方 norm 小写化 file 后 text gate 漏判」的运行时分歧（RevAll1-H1/codex-M3）
    { title: "npe risk", detail: "null deref", file: "src/PaymentService.java" },
    { title: "cleanup", detail: "refactor", file: "src/UserDTO.java" },
    { title: "add types", detail: "", file: "src/InvoiceLedger.ts" },
    { title: "pool tuning", detail: "resize", file: "src/LoadBalancer.java" },  // 负控：均衡类不 gate
  ];
  // 复现运行时调用约定：caller 先 norm(file)（ci=1 小写化）再传，isGated 用 origFile(保原大小写)做 text gate。两 ci 模式各跑一遍。
  const callConv = (isGated, f, ci) => {
    let s = String(f.file || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim();
    if (ci) s = s.toLowerCase();
    return isGated({ ...f, origFile: f.file, file: s });
  };
  const diffs = [];
  for (const ci of [true, false]) for (const f of corpus) {
    if (callConv(a.isGated, f, ci) !== callConv(b.isGated, f, ci))
      diffs.push(`[ci=${ci}] ${f.file}::${f.title} (mjs=${callConv(a.isGated, f, ci)} sh=${callConv(b.isGated, f, ci)})`);
  }
  assert(diffs.length === 0, `isGated 行为分歧 ${diffs.length} 例（运行时调用约定下 origFile/text/path 路由不一致）：\n    ` + diffs.join("\n    "));
});
check("isGated 调用点确实注入 origFile（防调用点漏注入使等价测试假过，codex-R2-L2）", () => {
  const sh = readFileSync(R("scripts/autoresearch-loop.sh"), "utf8");
  const mjs = readFileSync(R("workflows/autoresearch-loop.mjs"), "utf8");
  const shOF = (sh.match(/origFile:\s*f\.file/g) || []).length;
  assert(shOF >= 2, `.sh gatedscan+classify 应各注入 origFile: f.file（实测 ${shOF} 处 <2）——漏注入则 text gate 用小写化 file，camel/acronym 卡点漏判`);
  assert(/origFile:\s*line/.test(sh), ".sh gatepath 调用点缺 origFile: line（越权写 path 的 text gate 会漏大小写信号）");
  const mjsOF = (mjs.match(/origFile:\s*f\.file/g) || []).length;
  assert(mjsOF >= 2, `.mjs 预扫+fixable 应各注入 origFile: f.file（实测 ${mjsOF} 处 <2）`);
  assert(/origFile:\s*p\b/.test(mjs), ".mjs gatedWrites 调用点缺 origFile: p");
});
check("isGated 绝对期望锚点（防 .mjs/.sh 双边同错，Rev2-L1）", () => {
  const a = gatesOf("workflows/autoresearch-loop.mjs");
  const callConv = (isGated, f, ci) => { let s = String(f.file || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").trim(); if (ci) s = s.toLowerCase(); return isGated({ ...f, origFile: f.file, file: s }); };
  const expect = [
    [{ title: "npe", detail: "", file: "src/PaymentService.java" }, true, "仅文件名 Payment 应 gate"],
    [{ title: "x", detail: "", file: "src/UserDTO.java" }, true, "仅文件名 DTO 应 gate"],
    [{ title: "seed", detail: "", file: "db/migrations/001.sql" }, true, "迁移/.sql 应 gate"],
    [{ title: "tune", detail: "", file: "src/LoadBalancer.java" }, false, "loadBalancer 均衡类不得 gate"],
    [{ title: "refactor", detail: "", file: "src/ContractService.java" }, false, "普通 *Contract*.java 类名不得 gate（Rev2-M2）"],
    [{ title: "api", detail: "", file: "src/contracts/user.proto" }, true, "contracts/ 目录+proto 应 gate"],
    [{ title: "x", detail: "", file: "api/contract.yaml" }, true, "contract.yaml 契约工件应 gate（codex-final-M1：分隔符锚定非仅目录）"],
    [{ title: "x", detail: "", file: "pact/user-contract.json" }, true, "user-contract.json 应 gate（- 分隔）"],
    [{ title: "x", detail: "", file: "src/EnergyContract.java" }, false, "EnergyContract.java 域类名不得 gate"],
  ];
  const bad = [];
  for (const ci of [true, false]) for (const [f, exp, why] of expect) {
    const got = callConv(a.isGated, f, ci);
    if (got !== exp) bad.push(`[ci=${ci}] ${f.file} 期望 ${exp}（${why}）实得 ${got}`);
  }
  assert(bad.length === 0, `isGated 绝对期望不符 ${bad.length} 例（双边同错/语义漂移）：\n    ` + bad.join("\n    "));
});
check("每个 GATE_* 都被 isGated 接线（无定义却未引用的死 gate）", () => {
  for (const rp of ["workflows/autoresearch-loop.mjs", "scripts/autoresearch-loop.sh"]) {
    const { names, referenced } = gatesOf(rp);
    const orphan = names.filter((n) => !referenced.has(n));
    assert(orphan.length === 0, `${rp} 定义了 GATE 但 isGated 未引用：${orphan.join(", ")}`);
  }
});
check("human-gate.md 仍声明三处同步铁律 + 关键要点", () => {
  const hg = readFileSync(R("rules/human-gate.md"), "utf8");
  assert(/三处单一语义须同步|改一处必改三处/.test(hg), "human-gate.md 丢失同步铁律声明");
  assert(hg.includes("autoresearch-loop.mjs") && hg.includes("autoresearch-loop.sh"), "human-gate.md 未同时引用两脚本路径");
  assert(/GATE_BALANCE/.test(hg), "human-gate.md 未记录 GATE_BALANCE 双义精确化要点");
});

// ---- ultrawork v2 流水线接线（结构断言，非关键词——防升级丢弃 loop 能力/设计契约/门禁被绕）----
log("[7] ultrawork 流水线接线（结构断言）");
const UW = (f) => R(join("skills/ultrawork", f));
const mdBody = (p) => readFileSync(p, "utf8").replace(/<!--[\s\S]*?-->/g, "");   // 剥 md 注释后再判（防注释里的关键词冒充正文，与 SKILL 检查同标）
check("引用的 references/templates 存在且非空（空文件不算数）", () => {
  const files = ["references/pipeline-stages.md", "references/clarify-taxonomy.md", "references/analyze-gate.md", "references/convergence-scoping.md", "references/enterprise-gates.md", "assets/templates/constitution.md", "assets/templates/spec.md", "assets/templates/design.md", "assets/templates/plan.md", "assets/templates/tasks.md", "assets/templates/audit-evidence.md"];
  const bad = files.filter((f) => !existsSync(UW(f)) || readFileSync(UW(f), "utf8").trim().length < 200);
  assert(bad.length === 0, `ultrawork 引用文件缺失或近乎空（断链/占位）：${bad.join(", ")}`);
});
check("SKILL 正文（剥「## 资源」）真接线 loop/human-gate/设计契约/闸①②/Tester", () => {
  let sk = readFileSync(UW("SKILL.md"), "utf8").replace(/<!--[\s\S]*?-->/g, "");
  const i = sk.indexOf("## 资源"); if (i >= 0) sk = sk.slice(0, i);   // 排除资源清单，防其关键词冒充正文接线
  for (const [re, msg] of [
    [/autoresearch-loop/, "未接 autoresearch-loop 收敛内核（=丢 loop 能力）"],
    [/human-gate/, "未接 human-gate"],
    [/Stage 1\.5|设计契约/, "缺设计契约阶段"],
    [/人工闸①/, "缺人工闸①"],
    [/人工闸②|推送.{0,4}部署/, "缺人工闸②(推送/部署)"],
    [/loop 收敛/, "缺每层 loop 收敛"],
    [/[Tt]ester/, "缺 Tester(功能测试作者)"],
    [/Stage 6\.5|安全合规门|enterprise-gates/, "缺 Stage 6.5 安全合规门（对外 SaaS）"],
  ]) assert(re.test(sk), `SKILL 正文 ${msg}`);
});
check("enterprise-gates 结构：G1–G11 在门禁表行 + 阻断级 + scope + 结果 schema（非关键词恒真）", () => {
  const eg = mdBody(UW("references/enterprise-gates.md"));
  const rows = eg.split(/\r?\n/).filter((l) => /^\s*\|/.test(l));   // 只认 markdown 表格行，杜绝"写进注释/索引行"架空
  for (const g of ["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8", "G9", "G10", "G11"]) {
    const row = rows.find((l) => new RegExp(`\\b${g}\\b`).test(l));
    assert(row, `enterprise-gates 门禁表缺 ${g} 行`);
    assert(/硬挡|默认挡|critical|high|混合/i.test(row), `${g} 行无阻断级`);
  }
  assert(/SAST/.test(eg) && /DAST/.test(eg) && /SCA/.test(eg) && /SBOM/.test(eg) && /[Ss]ecret/.test(eg), "enterprise-gates 缺 SAST/DAST/SCA/SBOM/secrets");
  assert(/绝对/.test(eg) && /存量/.test(eg), "enterprise-gates 缺『绝对门/存量漏洞也挡』（纠 loop 回退制漏存量红）");
  assert(/not-run.{0,8}(fail|阻断)/i.test(eg), "enterprise-gates 缺『绝对门 not-run=fail』（防 not-run+waiver 架空绝对门）");
  assert(rows.some((l) => /\bG1b\b/.test(l) && /DAST/i.test(l)), "enterprise-gates 缺 G1b DAST 表行");
  assert(/技术控制子集|不在门禁内|out-of-scope/.test(eg), "enterprise-gates 缺 scope 界定（防过度承诺）");
  assert(/status/.test(eg) && /evidence/.test(eg) && /waiver/.test(eg) && /not-run/.test(eg), "enterprise-gates 缺门禁结果 schema（可执行闭环）");
  const cons = mdBody(UW("assets/templates/constitution.md"));
  assert(/合规/.test(cons) && /(留存 ≥|审计留存)/.test(cons), "constitution 缺合规目标/审计留存");
  const ps = mdBody(UW("references/pipeline-stages.md"));
  assert(/6\.5|安全合规门/.test(ps), "pipeline-stages 缺 Stage 6.5");
});
check("design.md §1–§5 + §8 安全合规 段齐全", () => {
  const d = mdBody(UW("assets/templates/design.md"));
  for (const [re, name] of [[/边界/, "边界"], [/输入输出|IO 契约/, "IO"], [/主逻辑链路|主链路/, "主链路"], [/支线/, "支线"], [/状态机/, "状态机"],
    [/威胁建模|STRIDE/, "§8威胁建模"], [/访问控制|RBAC/, "§8访问控制"], [/加密/, "§8加密"], [/审计事件|审计轨迹/, "§8审计"], [/数据生命周期|剩余信息/, "§8数据生命周期"]])
    assert(re.test(d), `design.md 缺「${name}」`);
});
check("挡门口径三文件一致 + 无反向/矛盾短语（enterprise/analyze/design）", () => {
  for (const f of ["references/enterprise-gates.md", "references/analyze-gate.md", "assets/templates/design.md"]) {
    const s = mdBody(UW(f));
    assert(/critical\s*[→:：]?\s*.{0,4}硬挡/i.test(s), `${f} 缺 critical→硬挡 口径`);
    assert(/high\s*.{0,5}默认挡/i.test(s), `${f} 缺 high→默认挡 口径`);
    assert(!/不再?硬挡/.test(s), `${f} 含反向口径（不硬挡/不再硬挡）`);
    assert(!/high[^\n]{0,4}硬挡/i.test(s), `${f} 含矛盾口径（high→硬挡）`);
  }
});
check("audit-evidence 覆盖 G1–G11 + status/evidence/waiver schema", () => {
  const ae = mdBody(UW("assets/templates/audit-evidence.md"));
  for (const g of ["G1", "G6", "G7", "G8", "G9", "G11"]) assert(new RegExp(`\\b${g}\\b`).test(ae), `audit-evidence 缺 ${g}`);
  assert(/status/.test(ae) && /evidence/.test(ae) && /waiver/.test(ae), "audit-evidence 缺 status/evidence/waiver schema");
});
check("convergence-scoping 保住『每产码阶段以收敛收尾』铁律 + --scope 分层", () => {
  const cs = readFileSync(UW("references/convergence-scoping.md"), "utf8");
  assert(/每个产码阶段必须以一次收敛收尾/.test(cs), "丢失『每产码阶段以收敛收尾』铁律");
  assert(/--scope/.test(cs), "缺 --scope 分层");
});
check("Task0 守卫：loop 默认三视角=general-purpose（不回退到 pin 死的专用 reviewer）", () => {
  const mjs = readFileSync(R("workflows/autoresearch-loop.mjs"), "utf8");
  const dp = mjs.slice(mjs.indexOf("DEFAULT_PERSPECTIVES"), mjs.indexOf("KNOWN_AGENTS"));
  assert(!/agentType:\s*'(security-reviewer|code-reviewer|architect-reviewer)'/.test(dp), "loop 默认视角回退到 pin 死的专用 reviewer（Task0 决策被破坏）");
  assert((dp.match(/general-purpose/g) || []).length >= 3, "loop 默认三视角未全用 general-purpose");
});

// ---- 汇总 ----
log("");
if (failures === 0) {
  log("✅ 全部通过（静态 + 确定性层）。");
} else {
  log(`❌ ${failures} 项失败 —— 见上。`);
}
log("\n── 需真实 CC 会话手动验（本 harness 不覆盖）──");
log("  1) 规则真加载：新会话问『human-gate 卡点2 / 我的两个主要项目』，零工具能答 = 加载成功");
log("  2) gate 真触发：让 CC 跑 `psql -f x.sql`，应被 danger-gate 当场拦下");
log("  3) 端到端循环：丢一句『把 X 压到 <阈值>』或『循环狼群修到测试绿』，看是否自收敛到 metric");
process.exit(failures === 0 ? 0 : 1);
