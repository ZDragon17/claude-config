#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

let raw = '';
process.stdin.setEncoding('utf8');

try {
  for await (const chunk of process.stdin) {
    raw += chunk;
  }
} catch {
  raw = '';
}

function parseInput(text) {
  const normalized = text.replace(/^\uFEFF/, '');
  if (!normalized.trim()) return {};
  try {
    return JSON.parse(normalized);
  } catch (error) {
    console.error(`[Hook] PostToolUse skipped: invalid JSON input (${error.message})`);
    return {};
  }
}

function objectValue(value) {
  return value && typeof value === 'object' ? value : {};
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function asText(value) {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveFilePath(filePath, cwd) {
  if (!filePath) return '';
  return isAbsolute(filePath) ? filePath : resolve(cwd || process.cwd(), filePath);
}

function findUp(startDir, fileName) {
  let dir = resolve(startDir);
  while (true) {
    const candidate = join(dir, fileName);
    if (existsSync(candidate)) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function npxCommand() {
  return process.platform === 'win32' ? 'npx.cmd' : 'npx';
}

function runNpx(args, cwd, timeout) {
  return execFileSync(npxCommand(), ['--no-install', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout,
  });
}

function scanConsoleLog(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const matches = [];

  content.split(/\r?\n/).forEach((line, index) => {
    const markerIndex = line.indexOf('console.log');
    if (markerIndex === -1) return;
    const before = line.slice(0, markerIndex);
    if (!before.includes('//')) {
      matches.push(`${index + 1}: ${line.trim()}`);
    }
  });

  if (matches.length) {
    console.error('[Hook] 警告: 发现 console.log 语句');
    matches.slice(0, 3).forEach((match) => console.error(`  ${match}`));
    if (matches.length > 3) {
      console.error(`  ... 还有 ${matches.length - 3} 处`);
    }
    console.error('[Hook] 提交前请移除调试代码');
  }
}

function scanJavaDebug(filePath) {
  const content = readFileSync(filePath, 'utf8');
  const matches = [];

  content.split(/\r?\n/).forEach((line, index) => {
    if (/System\.out\.print/.test(line) || /\.printStackTrace\(\)/.test(line)) {
      matches.push(`${index + 1}: ${line.trim()}`);
    }
  });

  if (matches.length) {
    console.error('[Hook] 警告: 发现调试代码');
    matches.slice(0, 3).forEach((match) => console.error(`  ${match}`));
    console.error('[Hook] 建议使用 Logger 替代');
  }
}

try {
  const input = parseInput(raw);
  const toolName = stringValue(input.tool_name || input.tool).toLowerCase();
  const toolInput = objectValue(input.tool_input || input.toolInput || input.input);
  const toolOutput = objectValue(input.tool_output || input.toolOutput);
  const toolResponse = objectValue(input.tool_response || input.toolResponse);
  const cwd = stringValue(input.cwd) || process.cwd();
  const command = stringValue(toolInput.command);
  const outputText = [
    toolOutput.output,
    toolOutput.stdout,
    toolOutput.stderr,
    toolResponse.output,
    toolResponse.stdout,
    toolResponse.stderr,
    input.output,
    input.result,
  ]
    .map(asText)
    .filter(Boolean)
    .join('\n');

  if ((toolName === 'bash' || toolName === 'shell_command') && /gh\s+pr\s+create\b/i.test(command)) {
    const match = outputText.match(/https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/\d+/);
    if (match) {
      const url = match[0];
      const repo = url.replace(/https:\/\/github\.com\/([^/]+\/[^/]+)\/pull\/\d+/, '$1');
      const pr = url.replace(/.*\/pull\/(\d+)/, '$1');
      console.error(`[Hook] PR 已创建: ${url}`);
      console.error(`[Hook] 审查: gh pr review ${pr} --repo ${repo}`);
    }
  }

  if (toolName !== 'edit') {
    process.exit(0);
  }

  const filePath = resolveFilePath(stringValue(toolInput.file_path || toolInput.path), cwd);
  if (!filePath || !existsSync(filePath)) {
    process.exit(0);
  }

  if (/\.(ts|tsx|js|jsx)$/i.test(filePath)) {
    const projectDir = findUp(dirname(filePath), 'package.json') || dirname(filePath);

    try {
      runNpx(['prettier', '--write', filePath], projectDir, 10000);
    } catch {
      // Formatting is advisory; missing local prettier must never fail the hook.
    }

    scanConsoleLog(filePath);
  }

  if (/\.(ts|tsx)$/i.test(filePath)) {
    const tsconfigDir = findUp(dirname(filePath), 'tsconfig.json');
    if (tsconfigDir) {
      try {
        const result = runNpx(['tsc', '--noEmit', '--pretty', 'false'], tsconfigDir, 30000);
        const lines = result
          .split(/\r?\n/)
          .filter((line) => line.includes(basename(filePath)))
          .slice(0, 5);
        if (lines.length) {
          console.error(`[TypeScript] ${lines.join('\n')}`);
        }
      } catch (error) {
        const out = `${asText(error.stdout)}${asText(error.stderr)}`;
        const lines = out
          .split(/\r?\n/)
          .filter((line) => line.includes(basename(filePath)))
          .slice(0, 5);
        if (lines.length) {
          console.error(`[TypeScript] ${lines.join('\n')}`);
        }
      }
    }
  }

  if (/\.java$/i.test(filePath)) {
    scanJavaDebug(filePath);
  }
} catch (error) {
  console.error(`[Hook] PostToolUse skipped: ${error.message}`);
}

process.exit(0);
