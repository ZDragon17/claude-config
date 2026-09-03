#!/usr/bin/env node

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
    console.error(`[Hook] PreToolUse skipped: invalid JSON input (${error.message})`);
    return {};
  }
}

function objectValue(value) {
  return value && typeof value === 'object' ? value : {};
}

function stringValue(value) {
  return typeof value === 'string' ? value : '';
}

function emit(lines) {
  for (const line of lines) {
    console.error(line);
  }
}

try {
  const input = parseInput(raw);
  const toolName = stringValue(input.tool_name || input.tool).toLowerCase();
  const toolInput = objectValue(input.tool_input || input.toolInput || input.input);
  const command = stringValue(toolInput.command);
  const filePath = stringValue(toolInput.file_path || toolInput.path);

  if (toolName === 'bash' || toolName === 'shell_command') {
    if (/\b(npm run dev|pnpm(?: run)? dev|yarn dev|bun run dev)\b/i.test(command)) {
      emit([
        '[Hook] 建议: 开发服务器应在 tmux 中运行以便访问日志',
        '[Hook] 用法: tmux new-session -d -s dev "npm run dev"',
        '[Hook] 连接: tmux attach -t dev',
      ]);
    }

    if (
      !process.env.TMUX &&
      /\b(npm (?:install|test)|pnpm (?:install|test)|yarn(?: (?:install|test))?|mvn|gradle|cargo build|make|docker|pytest|vitest|playwright)\b/i.test(command)
    ) {
      emit([
        '[Hook] 提示: 长时间运行的命令建议在 tmux 中执行',
        '[Hook] tmux new -s dev | tmux attach -t dev',
      ]);
    }

    if (/\bgit\s+push\b/i.test(command)) {
      emit([
        '[Hook] 提醒: 推送前请确认已审查所有更改',
        '[Hook] 继续推送...',
      ]);
    }
  }

  if (
    toolName === 'write' &&
    /\.(md|txt)$/i.test(filePath) &&
    !/(^|[\\/])(README|CLAUDE|AGENTS|CONTRIBUTING|CHANGELOG)\.md$/i.test(filePath)
  ) {
    emit([
      '[Hook] 警告: 创建非标准文档文件',
      `[Hook] 文件: ${filePath}`,
      '[Hook] 建议: 使用 README.md 或 CLAUDE.md 整合文档',
    ]);
  }
} catch (error) {
  console.error(`[Hook] PreToolUse skipped: ${error.message}`);
}

process.exit(0);
