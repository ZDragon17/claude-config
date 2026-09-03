#!/usr/bin/env node
/**
 * 通用人设注入脚本
 * 根据 current-persona.txt 的内容动态加载对应的 CLAUDE.md
 */

const fs = require('fs');
const path = require('path');

// 读取 stdin 输入
let stdinData = '';
process.stdin.on('data', (chunk) => {
  stdinData += chunk;
});

process.stdin.on('end', () => {
  try {
    // 读取当前激活的人设
    const baseDir = path.join(__dirname, '..');
    const personaFile = path.join(baseDir, 'current-persona.txt');

    let currentPersona = 'laowang'; // 默认老王
    if (fs.existsSync(personaFile)) {
      currentPersona = fs.readFileSync(personaFile, 'utf-8').trim();
    }

    // 读取对应人设的 CLAUDE.md
    const claudeMdPath = path.join(baseDir, 'plugins', currentPersona, 'CLAUDE.md');

    if (!fs.existsSync(claudeMdPath)) {
      console.error(`[Hook] 人设配置文件不存在，跳过注入: ${claudeMdPath}`);
      console.log(JSON.stringify({}));
      process.exit(0);
    }

    const claudeContent = fs.readFileSync(claudeMdPath, 'utf-8');

    // 输出 JSON 格式
    const output = {
      hookSpecificOutput: {
        hookEventName: "UserPromptSubmit",
        additionalContext: claudeContent
      }
    };

    console.log(JSON.stringify(output));
    process.exit(0);
  } catch (error) {
    console.error('[Hook] 人设注入失败，已跳过:', error.message);
    console.log(JSON.stringify({}));
    process.exit(0);
  }
});
