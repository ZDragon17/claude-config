#!/usr/bin/env node
// PostToolUse：领域规则自动注入（复现 Cursor `globs:`）+ 规则使用计数（喂给凋亡扫描）。
//
// 注入：编辑某类文件时把匹配的语言/领域规范用 additionalContext 注入上下文，
//       让非常驻、靠 glob 触发的规范真正进得了上下文。每会话每规则只注一次防噪。
// 计数：① 注入一条规则 → 该规则用量 +1；② Read 到 rules/*.md → 该规则用量 +1。
//       **聚合计数不是追加流水**：单个 JSON 只存 {rule:{c:次数,t:最后日期}}，
//       大小被规则数封死（~32 条 ≈ 2KB），跑多久都打不爆磁盘。
// 纯咨询：任何异常都 exit 0，绝不阻断主流程。

import { readFileSync, existsSync, mkdirSync, writeFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = join(homedir(), ".claude");
const RULES = join(BASE, "rules");
const CACHE = join(BASE, ".cache");
const USAGE = join(CACHE, "rule-usage.json");

function done() { process.exit(0); }

// ---- 聚合用量计数（有界，绝不无限增长）----
function bumpUsage(ruleFiles) {
  if (!ruleFiles.length) return;
  try {
    mkdirSync(CACHE, { recursive: true });
    let u = {};
    try {
      // 防御：万一文件异常膨胀（>256KB，正常 ~2KB），直接重置
      if (existsSync(USAGE) && statSync(USAGE).size < 262144) u = JSON.parse(readFileSync(USAGE, "utf8"));
    } catch { u = {}; }
    const today = new Date().toISOString().slice(0, 10);
    for (const r of ruleFiles) {
      u[r] = { c: ((u[r] && u[r].c) || 0) + 1, t: today };
    }
    writeFileSync(USAGE, JSON.stringify(u));
  } catch { /* 计数失败不影响主流程 */ }
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, "utf8") || "{}"); } catch { done(); }
const tool = payload.tool_name || payload.tool || "";
const fp = String(
  payload.tool_input?.file_path ?? payload.tool_input?.path ?? payload.tool_input?.notebook_path ?? ""
).replace(/\\/g, "/");

// ① Read 到 rules/*.md → 仅计数（已被 Read 加载，无需注入）
if (tool === "Read" && /\/\.claude\/rules\/([\w-]+\.md)$/.test(fp)) {
  bumpUsage([fp.match(/\/rules\/([\w-]+\.md)$/)[1]]);
  done();
}

// ② 仅在写类工具上做 glob 注入
if (!/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(tool) || !fp) done();

const lower = fp.toLowerCase();
const ext = (lower.match(/\.[a-z0-9]+$/) || [""])[0];
const baseName = lower.split("/").pop() || "";

const MAP = [
  [() => ext === ".java", "java-spring.md"],
  [() => ext === ".vue", "vue.md"],
  [() => ext === ".py", "python.md"],
  [() => ext === ".go", "go.md"],
  [() => ext === ".tsx" || ext === ".jsx", "react.md"],
  [() => ext === ".ts", "typescript.md"],
  [() => ext === ".sql" || /\/migrations?\//.test(lower), "sql.md"],
  [() => baseName === "dockerfile" || ext === ".yaml" || ext === ".yml" || /docker-compose/.test(baseName), "docker-k8s.md"],
  [() => ext === ".md", "markdown.md"],
  [() => /controller|\/api\/|restcontroller|endpoint/.test(lower), "api-design.md"],
  [() => /mqtt|emqx/.test(lower), "mqtt-iot.md"],
  [() => /modbus/.test(lower), "modbus-protocol.md"],
  [() => /\b(iot|sensor|device)\b/.test(lower) || /device|sensor/.test(baseName), "iot-device.md"],
  [() => /websocket|socket|\bws\b/.test(lower), "websocket-push.md"],
  [() => baseName === "commit_editmsg", "git-commit.md"],
];

const matched = [...new Set(MAP.filter(([t]) => { try { return t(); } catch { return false; } }).map(([, r]) => r))]
  .filter((r) => existsSync(join(RULES, r)));
if (matched.length === 0) done();

// 每会话去重
const sid = String(payload.session_id || payload.sessionId || "nosession").replace(/[^\w-]/g, "");
const stateFile = join(CACHE, "rule-inject", sid + ".json");
let injected = [];
try { injected = JSON.parse(readFileSync(stateFile, "utf8")); } catch {}
const fresh = matched.filter((r) => !injected.includes(r));
if (fresh.length === 0) done();

let ctx = "";
for (const r of fresh) {
  try {
    const body = readFileSync(join(RULES, r), "utf8");
    ctx += `\n──── 领域规范自动加载：rules/${r}（本会话首次，因你在编辑 ${baseName}）────\n${body}\n`;
  } catch {}
}
if (!ctx) done();

try {
  mkdirSync(join(CACHE, "rule-inject"), { recursive: true });
  writeFileSync(stateFile, JSON.stringify([...injected, ...fresh]));
} catch {}
bumpUsage(fresh);

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: ctx },
}));
process.exit(0);
