#!/usr/bin/env node
/**
 * fix-understand-graph.mjs — understand-anything 知识图谱后处理修正
 *
 * 背景：understand-anything 插件的 file-analyzer subagent 产出的 knowledge-graph.json
 * 存在三类与 dashboard schema 不符的问题，且插件自带的 Phase 6 校验抓不到，导致
 * dashboard 加载时静默丢弃节点/边（"loaded with N dropped items"），不报错。
 * 本脚本在 /understand 跑完后补一刀，把图谱修成 dashboard 能完整加载的形态。
 *
 * 修正三处：
 *   1. lineRange 字段：对象 {start,end} 或字符串 "12-34" → 数组元组 [12,34]（dashboard 要求 tuple）
 *   2. 畸形节点 ID：类名段多冒号 `class:path::Name` → `class:path:Name`（同步修边/层/导览的引用）
 *   3. 缺失 weight：边只有 confidence 时补 weight=confidence（dashboard 读 weight，merge 脚本只写 confidence）
 *
 * 用法：
 *   node ~/.claude/scripts/fix-understand-graph.mjs <项目根目录或 .understand-anything 目录或 knowledge-graph.json 路径>
 *   不传参数时默认当前工作目录。
 *
 * 退出码：0=成功（含无需修改），1=找不到图谱文件或 JSON 解析失败，2=修后仍有悬空引用
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

function resolveGraphPath(input) {
  const p = resolve(input || ".");
  // 直接给了 json 文件
  if (p.endsWith(".json") && existsSync(p)) return p;
  // 给了 .understand-anything 目录
  let candidate = join(p, "knowledge-graph.json");
  if (existsSync(candidate)) return candidate;
  // 给了项目根目录
  candidate = join(p, ".understand-anything", "knowledge-graph.json");
  if (existsSync(candidate)) return candidate;
  return null;
}

function toTuple(lineRange) {
  if (Array.isArray(lineRange)) return lineRange.length >= 2 ? [lineRange[0], lineRange[1]] : null;
  if (lineRange && typeof lineRange === "object") {
    const s = lineRange.start ?? lineRange.startLine ?? lineRange[0];
    const e = lineRange.end ?? lineRange.endLine ?? lineRange[1];
    return s != null && e != null ? [Number(s), Number(e)] : null;
  }
  if (typeof lineRange === "string") {
    const m = lineRange.match(/(\d+)\s*[-,~]\s*(\d+)/);
    if (m) return [Number(m[1]), Number(m[2])];
  }
  return null;
}

function main() {
  const arg = process.argv[2];
  const graphPath = resolveGraphPath(arg);
  if (!graphPath) {
    console.error(`错误：找不到 knowledge-graph.json（输入：${arg || process.cwd()}）`);
    console.error("先跑 /understand 生成图谱，再用本脚本修正。");
    process.exit(1);
  }

  let g;
  try {
    g = JSON.parse(readFileSync(graphPath, "utf8"));
  } catch (err) {
    console.error(`错误：解析 ${graphPath} 失败 — ${err.message}`);
    process.exit(1);
  }

  const nodes = Array.isArray(g.nodes) ? g.nodes : [];
  const edges = Array.isArray(g.edges) ? g.edges : [];
  const layers = Array.isArray(g.layers) ? g.layers : [];
  const tour = Array.isArray(g.tour) ? g.tour : [];

  let fixLineRange = 0;
  let dropLineRange = 0;
  let fixId = 0;
  let fixWeight = 0;

  // 1. lineRange 归一为数组元组
  for (const n of nodes) {
    if (n.lineRange === undefined || n.lineRange === null) continue;
    if (Array.isArray(n.lineRange) && n.lineRange.length === 2) continue;
    const tuple = toTuple(n.lineRange);
    if (tuple) {
      n.lineRange = tuple;
      fixLineRange++;
    } else {
      delete n.lineRange; // 实在无法解析就删掉，避免 dashboard drop 整个节点
      dropLineRange++;
    }
  }

  // 2. 畸形 ID（连续冒号）归一，并建立 旧→新 映射
  const idMap = new Map();
  for (const n of nodes) {
    if (typeof n.id === "string" && /::+/.test(n.id)) {
      const nid = n.id.replace(/::+/g, ":");
      if (nid !== n.id) {
        idMap.set(n.id, nid);
        n.id = nid;
        fixId++;
      }
    }
  }
  if (idMap.size) {
    for (const e of edges) {
      if (idMap.has(e.source)) e.source = idMap.get(e.source);
      if (idMap.has(e.target)) e.target = idMap.get(e.target);
    }
    for (const L of layers) {
      if (Array.isArray(L.nodeIds)) L.nodeIds = L.nodeIds.map((id) => idMap.get(id) || id);
    }
    for (const t of tour) {
      if (Array.isArray(t.nodeIds)) t.nodeIds = t.nodeIds.map((id) => idMap.get(id) || id);
    }
  }

  // 3. 边补 weight（dashboard 期望 weight，merge 脚本只写 confidence）
  for (const e of edges) {
    if (e.weight === undefined) {
      e.weight = typeof e.confidence === "number" ? e.confidence : 0.5;
      fixWeight++;
    }
  }

  // 校验
  const nodeSet = new Set(nodes.map((n) => n.id));
  let dangling = 0;
  for (const e of edges) {
    if (!nodeSet.has(e.source) || !nodeSet.has(e.target)) dangling++;
  }
  const residualLineRange = nodes.filter(
    (n) => n.lineRange !== undefined && !Array.isArray(n.lineRange)
  ).length;

  const changed = fixLineRange + dropLineRange + fixId + fixWeight > 0;
  if (changed) {
    writeFileSync(graphPath, JSON.stringify(g, null, 2));
  }

  console.log(`图谱：${graphPath}`);
  console.log(`  nodes=${nodes.length} edges=${edges.length} layers=${layers.length} tour=${tour.length}`);
  console.log(`修正：lineRange转数组=${fixLineRange} | lineRange无法解析删除=${dropLineRange} | 畸形ID归一=${fixId} | 补weight=${fixWeight}`);
  console.log(`校验：悬空边=${dangling} | 残留非数组lineRange=${residualLineRange}`);
  console.log(changed ? "已写回修正后的图谱。" : "无需修改（图谱已干净）。");

  if (dangling > 0) {
    console.error("警告：仍有悬空边，dashboard 仍会丢弃这些边。请检查 merge 阶段是否漏修。");
    process.exit(2);
  }
  process.exit(0);
}

main();
