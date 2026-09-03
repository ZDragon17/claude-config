#!/usr/bin/env node
// 凋亡/剪枝扫描 —— 给配置体系补上"减法"(自然选择淘汰不适者)。
// 用法：node ~/.claude/scripts/prune-scan.mjs   （建议每月/批量复盘时跑）
// 纯报告，绝不删除（半自动：本脚本出清单 → 你审「淘汰/接线/保留」→ 才动手）。
//
// 新鲜度三信号：
//   ① 可达性：有无加载路径 = @import / 被可达规则提名 / rule-inject hook 按文件类型注入。
//      非常驻 + 无任何加载路径 = 物理上进不了上下文 = 死规则（最硬）。
//   ② 陈旧度：mtime 超阈值未改。
//   ③ 真实使用率：rule-usage.json（有界聚合计数，rule-inject hook 维护）—— 可达但从未触发才是真凋亡候选。
// 分类：不可达 + 单薄 + 陈旧 → 待淘汰；不可达 + 有体量 → 待接线（有价值但没接好，别删）。

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const BASE = join(homedir(), ".claude");
const RULES = join(BASE, "rules");
const STALE_DAYS = 90;          // 超 90 天未改 → 标记复审
const THIN_BYTES = 1500;        // < 1.5KB 视为单薄
const now = Date.now();
const daysAgo = (ms) => Math.round((now - ms) / 86400000);

// 读 CLAUDE.md 的 @import 作为常驻根
const claudeMd = readFileSync(join(BASE, "CLAUDE.md"), "utf8");
const roots = new Set(
  [...claudeMd.matchAll(/^@rules\/(\S+\.md)/gm)].map((m) => m[1])
);
const importRoots = new Set(roots);  // 真常驻(@import)——用量对其不 informative，单列
const USAGE = join(BASE, ".cache", "rule-usage.json");
let usage = {};
try { if (existsSync(USAGE)) usage = JSON.parse(readFileSync(USAGE, "utf8")); } catch {}

// hook 加载路径：rule-inject.mjs 按文件类型/领域自动注入的规则也算"可达"（复现 glob 机制）
try {
  const inj = readFileSync(join(BASE, "scripts", "hooks", "rule-inject.mjs"), "utf8");
  for (const m of inj.matchAll(/"([\w-]+\.md)"/g)) roots.add(m[1]);
} catch {}

// 读所有规则文件 + 元数据
const files = readdirSync(RULES).filter((f) => f.endsWith(".md"));
const meta = {};
for (const f of files) {
  const txt = readFileSync(join(RULES, f), "utf8");
  meta[f] = {
    size: Buffer.byteLength(txt),
    mtime: statSync(join(RULES, f)).mtimeMs,
    text: txt,
    base: f.replace(/\.md$/, ""),
  };
}

// 引用边：规则 A 提到规则 B 的 basename 或 [[B]] 或 B.md → A→B
function mentions(text, targetBase, targetFile) {
  if (text.includes(`[[${targetBase}]]`)) return true;
  if (text.includes(targetFile)) return true;          // 提到 B.md
  // 提到裸 basename（词边界，避免子串误判）
  const re = new RegExp(`(^|[^\\w-])${targetBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`);
  return re.test(text);
}

// BFS 传递闭包：从常驻根出发，沿引用可达的都算"可达"
const reachable = new Set([...roots].filter((f) => files.includes(f)));
let grew = true;
while (grew) {
  grew = false;
  for (const f of reachable) {
    for (const g of files) {
      if (reachable.has(g)) continue;
      if (mentions(meta[f].text, meta[g].base, g)) { reachable.add(g); grew = true; }
    }
  }
}

const unreachable = files.filter((f) => !reachable.has(f));
const stale = files.filter((f) => daysAgo(meta[f].mtime) > STALE_DAYS && !roots.has(f));

// 分类不可达
const toPrune = [];   // 不可达 + 单薄 + 陈旧
const toWire = [];    // 不可达 + 有体量（有价值，建议接线非删）
for (const f of unreachable) {
  const m = meta[f];
  const entry = `${f} (${(m.size / 1024).toFixed(1)}KB, ${daysAgo(m.mtime)}天)`;
  if (m.size < THIN_BYTES && daysAgo(m.mtime) > STALE_DAYS) toPrune.push(entry);
  else toWire.push(entry);
}

const log = (s) => process.stdout.write(s + "\n");
log("\n=== 凋亡/剪枝扫描（reachability + 新鲜度，纯报告不删）===\n");
log(`规则总数 ${files.length}　常驻根(@import) ${reachable.size && [...roots].filter(f=>files.includes(f)).length} 条　可达 ${reachable.size} 条　不可达 ${unreachable.length} 条\n`);

log(`【待接线】不可达但有体量（有价值,没接好 → 加载入或接受手动,别删）：${toWire.length}`);
for (const e of toWire) log(`  · ${e}`);
log("");
log(`【待淘汰】不可达 + 单薄 + 陈旧（凋亡候选）：${toPrune.length}`);
for (const e of toPrune) log(`  · ${e}`);
log("");
log(`【待复审】超 ${STALE_DAYS} 天未改且非常驻（不一定淘汰,值得过一眼）：${stale.length}`);
for (const f of stale) log(`  · ${f} (${daysAgo(meta[f].mtime)}天, ${(meta[f].size/1024).toFixed(1)}KB)${reachable.has(f)?"":" [且不可达]"}`);
log("");
const nonResident = files.filter((f) => reachable.has(f) && !importRoots.has(f));
const rows = nonResident
  .map((f) => ({ f, c: (usage[f] && usage[f].c) || 0, t: (usage[f] && usage[f].t) || "—", old: daysAgo(meta[f].mtime) > STALE_DAYS }))
  .sort((a, b) => a.c - b.c);
log(`【使用率】非常驻规则真实触发次数（有界聚合,需累积数周才有意义）：${rows.length}`);
for (const r of rows) log(`  · ${r.f}  用量 ${r.c}  最后 ${r.t}${r.c === 0 && r.old ? "  ⚠从未触发(陈旧→凋亡候选或查触发是否对)" : ""}`);
log("");
log("── 半自动凋亡协议 ──");
log("  1) 本清单交你逐条审：淘汰 / 接线 / 保留");
log("  2) 淘汰 = 移到 ~/.claude/_archive/（可回溯），不硬删");
log("  3) 接线 = 给【待接线】项加加载路径（CLAUDE.md @import 或被某常驻规则提名）");
log("  4) 改完跑 verify-config.mjs 确认一致性未破");
log("\n升级：本扫描已含『真实使用率』(rule-usage.json,rule-inject hook 有界聚合计数维护)——");
log("    可达 + 非常驻 + 从未触发 + 陈旧 = 比单看可达性更准的凋亡信号。日志按规则数封顶,不会打爆磁盘。");
