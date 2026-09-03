#!/usr/bin/env node
const { execFileSync } = require('child_process');

let input = '';
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  input = input.replace(/^\uFEFF/, '');
  if (!input.trim()) process.exit(0);
  const d = JSON.parse(input);
  const cwd = d.workspace?.current_dir || d.cwd || '';
  const model = d.model?.display_name || '';
  const session = d.session?.name || '';
  const usedPct = d.context_window?.used_percentage;

  const home = process.env.HOME || process.env.USERPROFILE || '';
  const shortCwd = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;

  let gitBranch = '';
  if (cwd) {
    try {
      gitBranch = execFileSync('git', ['--no-optional-locks', '-C', cwd, 'symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    } catch {
      try {
        gitBranch = execFileSync('git', ['--no-optional-locks', '-C', cwd, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
      } catch {}
    }
  }

  const parts = [];
  if (shortCwd) parts.push(`\x1b[34m${shortCwd}\x1b[0m`);
  if (gitBranch) parts.push(`\x1b[32m(${gitBranch})\x1b[0m`);
  if (session) parts.push(`\x1b[35m${session}\x1b[0m`);
  if (model) parts.push(`\x1b[33m${model}\x1b[0m`);

  if (usedPct != null) {
    const pct = Math.round(usedPct);
    const color = pct >= 80 ? '\x1b[31m' : pct >= 50 ? '\x1b[33m' : '\x1b[32m';
    parts.push(`${color}ctx:${pct}%\x1b[0m`);
  }

  process.stdout.write(parts.join(' '));
});

