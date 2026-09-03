#!/usr/bin/env node

// PostToolUse hook：上下文退化预警守卫。
// 每次工具调用后读取 transcript 的最近一条 usage，估算当前上下文占用，
// 接近大模型退化高发区（1M 上限约 750k）时通过 stderr 提示用户 /clear。
//
// 铁律：这是一个纯只读的咨询型 hook。
//  - 任何异常路径（stdin 空 / JSON 坏 / transcript 读不到 / usage 字段缺）
//    都必须被 try/catch 兜住并 process.exit(0)，绝不抛错、绝不非零退出阻断主流程。
//  - 只读 transcript，只向 stderr 输出提示，不写任何文件、不调用任何外部命令。

import { existsSync, readFileSync } from 'node:fs';

let raw = '';
process.stdin.setEncoding('utf8');

try {
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
} catch {
  raw = '';
}

// ---- 阈值策略 ----
// 1M 上下文模型在接近上限时检索质量明显退化（退化高发区）。
// 留出约 25% 余量，750k 起警告，900k 起强烈警告。
const CONTEXT_LIMIT = 1_000_000;
const WARN_THRESHOLD = 750_000;
const CRITICAL_THRESHOLD = 900_000;

function parseInput(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  if (!normalized.trim()) return {};
  try {
    return JSON.parse(normalized);
  } catch {
    return {};
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function numberValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// 从单条 usage 对象计算上下文占用：input + cache_read + cache_creation。
// output_tokens 不计入——它不占用后续请求的上下文窗口。
function occupancyFromUsage(usage) {
  if (!usage || typeof usage !== 'object') return 0;
  return (
    numberValue(usage.input_tokens) +
    numberValue(usage.cache_read_input_tokens) +
    numberValue(usage.cache_creation_input_tokens)
  );
}

// 取 transcript 中最后一条带 usage 的记录的占用值。
// 用「最近一条」而非「历史最大」——它代表当前上下文窗口的真实占用。
function latestOccupancy(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return 0;

  let content;
  try {
    content = readFileSync(transcriptPath, 'utf8');
  } catch {
    return 0;
  }

  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    const line = lines[i].trim();
    if (!line) continue;
    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const usage = entry && entry.message && entry.message.usage;
    const occ = occupancyFromUsage(usage);
    if (occ > 0) return occ;
  }
  return 0;
}

function formatTokens(n) {
  return `${Math.round(n / 1000)}k`;
}

try {
  const input = parseInput(raw);
  const transcriptPath = stringValue(input.transcript_path || input.transcriptPath);
  const occupancy = latestOccupancy(transcriptPath);

  if (occupancy >= CRITICAL_THRESHOLD) {
    console.error(
      `[Hook] 严重: 上下文占用约 ${formatTokens(occupancy)} / ${formatTokens(CONTEXT_LIMIT)}，已进入退化高发区。`,
    );
    console.error('[Hook] 强烈建议立即 /clear 开新会话，否则检索质量和指令遵循将明显下降。');
  } else if (occupancy >= WARN_THRESHOLD) {
    console.error(
      `[Hook] 警告: 上下文占用约 ${formatTokens(occupancy)} / ${formatTokens(CONTEXT_LIMIT)}，接近退化高发区。`,
    );
    console.error('[Hook] 建议在完成当前小节后 /clear，把关键结论先落盘再开新会话。');
  }
} catch (error) {
  // 守卫绝不阻断主流程：任何意外都降级为静默提示。
  console.error(`[Hook] 上下文守卫跳过: ${error.message}`);
}

process.exit(0);
