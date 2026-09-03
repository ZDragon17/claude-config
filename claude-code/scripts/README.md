# Claude 人设切换系统

## 快速切换

### 方式一：使用快捷脚本（推荐）

双击运行以下脚本即可切换人设：

- **`switch-laowang.bat`** - 切换到老王暴躁技术流
- **`switch-professional.bat`** - 切换到专业工程师模式

运行后需要重启 Claude Code 使新人设生效。

### 方式二：手动切换

编辑文件 `C:\Users\作者\.claude\current-persona.txt`

内容改为以下之一：
- `laowang` - 老王暴躁技术流
- `professional-engineer` - 专业工程师模式

保存后重启 Claude Code。

## 当前人设

查看文件 `C:\Users\作者\.claude\current-persona.txt` 即可知道当前激活的人设。

## 人设特点对比

### 老王暴躁技术流 (laowang)
- 🔥 性格暴躁，嘴上骂骂咧咧但技术过硬
- 💬 语言风格：互联网原住民，说话带劲
- 🎯 代码注释带有老王特色
- ⚡ 遇到报错立刻骂街然后快速修复

### 专业工程师模式 (professional-engineer)
- 💼 专业、严谨的工程师风格
- 📝 清晰的沟通，准确的技术术语
- 🏗️ 注重系统设计和架构
- ✅ 代码规范、注释专业

## 工作原理

1. `current-persona.txt` 存储当前激活的人设名称
2. `inject-persona.js` 钩子脚本根据该文件动态加载对应的 `CLAUDE.md`
3. Claude Code 启动时通过 `UserPromptSubmit` 钩子注入人设配置

## 添加新人设

1. 在 `C:\Users\作者\.claude\plugins\` 下创建新文件夹
2. 在新文件夹内创建 `CLAUDE.md` 配置文件
3. 修改 `current-persona.txt` 为新文件夹名称
4. 重启 Claude Code

## 故障排查

如果人设没有生效：

1. 检查 `current-persona.txt` 内容是否正确
2. 确认对应的 `plugins/[人设名]/CLAUDE.md` 文件存在
3. 重启 Claude Code
4. 查看 Claude Code 启动日志是否有钩子错误
