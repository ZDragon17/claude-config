@echo off
chcp 65001 >nul
echo 切换到老王人设...
echo laowang > "%USERPROFILE%\.claude\current-persona.txt"
echo.
echo ✓ 已切换到【老王暴躁技术流】
echo 请重启 Claude Code 使人设生效
pause
