#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';

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
  } catch {
    return {};
  }
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function git(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10000,
    }).trim();
  } catch {
    return '';
  }
}

function hasActiveConsoleLog(line) {
  const index = line.indexOf('console.log');
  if (index === -1) return false;
  return !line.slice(0, index).includes('//');
}

try {
  const input = parseInput(raw);
  const cwd = stringValue(input.cwd) || process.cwd();
  const root = git(['rev-parse', '--show-toplevel'], cwd) || cwd;
  const changed = git(['diff', '--name-only', 'HEAD'], root)
    .split(/\r?\n/)
    .map((file) => file.trim())
    .filter((file) => file && /\.(ts|tsx|js|jsx)$/i.test(file));

  const warnings = [];
  for (const file of changed) {
    const filePath = isAbsolute(file) ? file : resolve(root, file);
    if (!existsSync(filePath)) continue;

    try {
      readFileSync(filePath, 'utf8')
        .split(/\r?\n/)
        .forEach((line, index) => {
          if (hasActiveConsoleLog(line)) {
            warnings.push(`${file}:${index + 1}`);
          }
        });
    } catch {
      // Ignore unreadable working tree paths; this hook is advisory only.
    }
  }

  if (warnings.length) {
    console.error('[Hook] 提醒: 修改的文件中有 console.log');
    warnings.slice(0, 5).forEach((warning) => console.error(`  ${warning}`));
  }
} catch (error) {
  console.error(`[Hook] Stop scan skipped: ${error.message}`);
}

process.exit(0);
