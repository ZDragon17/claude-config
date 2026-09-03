#!/usr/bin/env bash
# omp(oh-my-pi) 升级脚本 —— 单 exe 手动安装，mise 不管；用法: bash upgrade-omp.sh [版本号，默认 latest]
set -euo pipefail
OMP_BIN="/d/WorkSoft/omp"
REPO="can1357/oh-my-pi"

cur="$("$OMP_BIN" --version 2>/dev/null || echo unknown)"
ver="${1:-$(gh api "repos/$REPO/releases/latest" --jq .tag_name)}"
echo "当前: $cur -> 目标: $ver"

[ "$cur" = "omp/${ver#v}" ] && { echo "已是最新"; exit 0; }

cp "$OMP_BIN" "$OMP_BIN.$(echo "$cur" | tr '/' '-').bak"
gh release download "$ver" --repo "$REPO" --pattern "omp-windows-x64.exe" --output "$OMP_BIN" --clobber
echo "升级完成: $("$OMP_BIN" --version)（备份: $OMP_BIN.$(echo "$cur" | tr '/' '-').bak）"
