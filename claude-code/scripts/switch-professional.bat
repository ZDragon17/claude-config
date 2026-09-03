@echo off
chcp 65001 >nul
echo 切换到专业工程师人设...
echo professional-engineer > "%USERPROFILE%\.claude\current-persona.txt"
echo.
echo ✓ 已切换到【专业工程师模式】
echo 请重启 Claude Code 使人设生效
pause
