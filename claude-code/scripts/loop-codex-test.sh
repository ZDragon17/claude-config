#!/usr/bin/env bash
# =============================================================================
# loop-codex-test.sh —— 证明 autoresearch-loop.sh 的 codex 后端 + 收敛链路真能用的测试套件。
# -----------------------------------------------------------------------------
# 四层（逐层加成本）：
#   [1] 静态检查（无 codex，快）：sh 语法 + 平台沙箱分支/notify/timeout 接线 + 参数校验 + **解析真源码**的沙箱选择。
#   [2] codex 就绪冒烟（活跑 ~30-120s）：与 .sh 同款平台沙箱形 + notify=[] 跑 trivial 计算 prompt，
#       证明 codex 在本机 auth OK 且**不 stall**；非 Windows 另验 workspace-write 沙箱真能落盘（fix 阶段用）。
#   [3a] 离线 CONVERGED 路径（stub 后端，**确定性、不耗额度、默认跑**）：干净 fixture 经
#        CLEAN→ratchet→CONVERGED→exit0 全链路，断言 final JSON finalVerdict=CONVERGED 且 rc=0。
#   [3a2] 离线非收敛路径（stub 持续返回 finding，确定性、默认跑）：有 finding 时**绝不假收敛**（finalVerdict≠CONVERGED + rc!=0）。
#   [3b] 真 codex 端到端（opt-in `LOOP_CODEX_E2E=1`）：真 codex 跑 div fixture，只断言**产出 finalVerdict 且未挂死**
#        （codex 能否发现具体 bug 依赖模型；收敛/非收敛的确定性正确性由 [3a]/[3a2] 覆盖）。
# 退出码：全过 0 / 任一失败 1。用法：bash ~/.claude/scripts/loop-codex-test.sh  [LOOP_CODEX_E2E=1 开真 codex 端到端]
# 注：autoresearch-loop.sh 是 100644（无执行位），故全程用 `bash "$LOOP"` 调用（直接执行在 POSIX 会 rc=126，codex M6）。
# =============================================================================
set -uo pipefail

CLAUDE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOOP="$CLAUDE_DIR/scripts/autoresearch-loop.sh"
SCRATCH="$CLAUDE_DIR/_e2e-scratch/ct-$$"   # 仓库内 scratch（.gitignore 内），避开某些 bash 的 /tmp 解析怪癖；退出清理
PASS=0; FAIL=0
ok(){ echo "  ✅ $1"; PASS=$((PASS+1)); }
no(){ echo "  ❌ $1"; FAIL=$((FAIL+1)); }
cleanup(){ rm -rf "$SCRATCH" 2>/dev/null; }
trap cleanup EXIT
mkdir -p "$SCRATCH"

# 复用 .sh 同款超时探测（GNU timeout / macOS gtimeout 才套）；set -u 安全展开
TO=(); if timeout -k 1s 0.1s true >/dev/null 2>&1; then TO=(timeout -k 10s 120s); elif gtimeout -k 1s 0.1s true >/dev/null 2>&1; then TO=(gtimeout -k 10s 120s); fi
# 复用 .sh 同款平台沙箱选择
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) WIN=1 ;; *) WIN=0 ;; esac
if (( WIN )); then RO_SB="--dangerously-bypass-approvals-and-sandbox"; WR_SB="--dangerously-bypass-approvals-and-sandbox";
else RO_SB="-s read-only"; WR_SB="-s workspace-write"; fi

echo ""
echo "=== loop-codex-test （平台：$(uname -s 2>/dev/null || echo unknown)，WIN=$WIN，超时探测：$([ ${#TO[@]} -gt 0 ] && echo 有 || echo 无)）==="

echo ""
echo "[1] 静态检查（无 codex）"
[[ -f "$LOOP" ]] && ok "autoresearch-loop.sh 存在" || { no "找不到 $LOOP"; echo; echo "❌ 致命：脚本缺失"; exit 1; }
bash -n "$LOOP" && ok "sh 语法通过" || no "sh 语法失败"
grep -q 'CODEX_WIN=1' "$LOOP" && ok "含 Windows 平台探测" || no "缺 CODEX_WIN 平台探测"
grep -q 'dangerously-bypass-approvals-and-sandbox' "$LOOP" && ok "Windows bypass 分支存在" || no "缺 bypass 分支"
grep -Eq "notify=['\"]?\[\]" "$LOOP" && ok "codex 调用含 notify=[]（关 turn-ended hook）" || no "缺 notify=[]"
grep -q 'workspace-write' "$LOOP" && grep -q 'read-only' "$LOOP" && ok "非 Windows 角色沙箱(read-only/workspace-write)存在" || no "缺角色沙箱"
grep -Eq 'TO\[@\]' "$LOOP" && ok "TO 超时前缀数组化（避免 quoting/空数组 unbound）" || no "TO 未数组化"
grep -Eq 'rc *== *124 *\|\| *rc *== *137' "$LOOP" && ok "超时退出码守卫（丢半截 stdout）" || no "缺超时 rc 守卫"
grep -q 'gatebaseline' "$LOOP" && ok "基线人工卡点接线（改动集敏感路径直接 STOP，codex-H1）" || no "缺基线卡点 gatebaseline"
# 参数校验：非法 --backend-timeout 应 exit 2（用 bash 调，避开无执行位 rc=126）
bash "$LOOP" --repo "$CLAUDE_DIR" --backend-timeout abc >/dev/null 2>&1; [[ $? -eq 2 ]] && ok "非法 --backend-timeout 被拒(exit 2)" || no "非法 --backend-timeout 未被拒"
# 沙箱选择：**解析 .sh 真身**的 cxsb 分支（非脚本内自算，杜绝恒真），断言 3 分支值正确
cxblk="$(grep -n 'cxsb=' "$LOOP")"
if   echo "$cxblk" | grep -Eq 'CODEX_WIN *\)\); *then *cxsb="--dangerously-bypass-approvals-and-sandbox"' \
  && echo "$cxblk" | grep -Eq 'mode" *== *fix *\]\]; *then *cxsb="-s workspace-write"' \
  && echo "$cxblk" | grep -Eq 'else *cxsb="-s read-only"'; then
  ok "沙箱选择 3 分支解析自真源码：WIN→bypass / fix→workspace-write / review→read-only"
else
  no "沙箱选择分支与预期不符（解析真源码）"; echo "$cxblk" | sed 's/^/    | /'
fi

echo ""
echo "[2] codex 就绪冒烟（活跑）"
if ! command -v codex >/dev/null 2>&1; then
  no "codex 不在 PATH —— 后端不可用（装 @openai/codex 或 --backend claude）"
else
  ok "codex 在 PATH（$(codex --version 2>/dev/null | head -1)）"
  # 只读冒烟：与 .sh review 路径同款沙箱 + notify=[]，跑**计算** prompt（答案不在 prompt 里，防回显假阳）
  smk="$SCRATCH/smoke"; mkdir -p "$smk"; ( cd "$smk" && git init -q 2>/dev/null )
  out="$(cd "$smk" && printf 'reply with only the result of 137+284 and nothing else. do not run any commands.' | ${TO[@]+"${TO[@]}"} codex exec -c notify='[]' $RO_SB --skip-git-repo-check - 2>/dev/null)"; rc=$?
  if (( rc == 124 || rc == 137 )); then no "codex 就绪冒烟超时被 kill（rc=$rc）——本机 codex 跑不动/沙箱 stall（Windows 请确认走 bypass；否则用 WSL）"
  elif echo "$out" | grep -q '421'; then ok "codex exec 就绪：算出 421（auth OK + 真答复 + 沙箱不 stall）"
  else no "codex exec 未算出 421（rc=$rc）——可能未登录/限流：$(echo "$out" | tail -1 | cut -c1-120)"
  fi
  # 非 Windows 另验 workspace-write 沙箱真能落盘（fix 阶段用；Windows 两者都 bypass 故 [2] 已覆盖，跳过）
  if (( ! WIN )); then
    wr="$SCRATCH/wrsb"; mkdir -p "$wr"; ( cd "$wr" && git init -q 2>/dev/null )
    ( cd "$wr" && printf 'create a file named PROOF.txt containing exactly the text OK, then stop. no explanations.' | ${TO[@]+"${TO[@]}"} codex exec -c notify='[]' $WR_SB --skip-git-repo-check - >/dev/null 2>&1 )
    if [[ -f "$wr/PROOF.txt" ]]; then ok "workspace-write 沙箱真能落盘（fix 阶段沙箱可写、不 stall）"; else no "workspace-write 沙箱未写出文件（fix 阶段可能被拒/stall）"; fi
  fi
fi

echo ""
echo "[3a] 离线 CONVERGED 路径（stub 后端，确定性，不耗 codex 额度）"
stub="$SCRATCH/stub"; cfix="$SCRATCH/cfix"; mkdir -p "$stub" "$cfix"
# 假 codex：忽略参数、吸干 stdin、回一个"干净 review"（reviewedFiles 覆盖改动文件、findings 空）→ 驱动 CLEAN→CONVERGED
cat > "$stub/codex" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null 2>&1
echo '{"reviewedFiles":["calc.js"],"findings":[]}'
STUB
chmod +x "$stub/codex"
(
  cd "$cfix" && git init -q && git config user.email t@t.co && git config user.name t
  printf 'function add(a,b){return a+b}\nmodule.exports={add}\n' > calc.js
  printf 'const {add}=require("./calc");if(add(2,3)!==5){process.exit(1)}console.log("1 passed")\n' > calc.test.js
  git add -A && git commit -qm baseline
  # 干净的未提交改动（加注释，无任何问题）→ stub review 返回空 findings → 应收敛
  printf 'function add(a,b){return a+b} // tested add\nmodule.exports={add}\n' > calc.js
)
cout="$(PATH="$stub:$PATH" bash "$LOOP" --repo "$cfix" --backend codex --max-rounds 2 --min-clean 1 --perspectives correct --test-cmd 'node calc.test.js' 2>&1)"; crc=$?
cverdict="$(echo "$cout" | grep -o '"finalVerdict":"[A-Z]*"' | tail -1)"
echo "  stub CONVERGED: rc=$crc $cverdict"
if [[ "$cverdict" == '"finalVerdict":"CONVERGED"' ]] && (( crc == 0 )); then
  ok "离线 CONVERGED：干净 fixture 经 CLEAN→ratchet→CONVERGED→exit0（stub 后端，唯一走通收敛主路径的确定性用例）"
else
  no "离线 CONVERGED 未达成（rc=$crc verdict=$cverdict）"; echo "$cout" | tail -10 | sed 's/^/    | /'
fi

echo ""
echo "[3a2] 离线非收敛路径（stub 持续返回 finding，确定性，验绝不假收敛）"
stub2="$SCRATCH/stub2"; nfix="$SCRATCH/nfix"; mkdir -p "$stub2" "$nfix"
cat > "$stub2/codex" <<'STUB'
#!/usr/bin/env bash
cat >/dev/null 2>&1
echo '{"reviewedFiles":["calc.js"],"findings":[{"title":"div 无 b==0 校验","file":"calc.js","severity":"M","detail":"边界问题"}]}'
STUB
chmod +x "$stub2/codex"
(
  cd "$nfix" && git init -q && git config user.email t@t.co && git config user.name t
  printf 'function add(a,b){return a+b}\nmodule.exports={add}\n' > calc.js
  printf 'const {add}=require("./calc");if(add(2,3)!==5){process.exit(1)}console.log("1 passed")\n' > calc.test.js
  git add -A && git commit -qm baseline
  printf 'function add(a,b){return a+b}\nfunction div(a,b){return a/b}\nmodule.exports={add,div}\n' > calc.js
)
nout="$(PATH="$stub2:$PATH" bash "$LOOP" --repo "$nfix" --backend codex --max-rounds 2 --min-clean 1 --perspectives correct --test-cmd 'node calc.test.js' 2>&1)"; nrc=$?
nverdict="$(echo "$nout" | grep -o '"finalVerdict":"[A-Z]*"' | tail -1)"
echo "  stub 非收敛: rc=$nrc $nverdict"
if [[ -n "$nverdict" ]] && [[ "$nverdict" != '"finalVerdict":"CONVERGED"' ]] && (( nrc != 0 )); then
  ok "离线非收敛：持续有 finding → 绝不假收敛（finalVerdict=$nverdict, rc=$nrc）"
else
  no "离线非收敛异常（rc=$nrc verdict=$nverdict）——期望非 CONVERGED + rc!=0"; echo "$nout" | tail -8 | sed 's/^/    | /'
fi

echo ""
echo "[3b] 真 codex 端到端（opt-in LOOP_CODEX_E2E=1，耗额度）"
if [[ "${LOOP_CODEX_E2E:-0}" != "1" ]]; then
  echo "  ⏭  跳过（设 LOOP_CODEX_E2E=1 开启；会耗 codex 额度、约数分钟）"
elif ! command -v codex >/dev/null 2>&1; then
  no "codex 不在 PATH，无法跑真端到端"
else
  efix="$SCRATCH/efix"; mkdir -p "$efix"
  (
    cd "$efix" && git init -q && git config user.email t@t.co && git config user.name t
    printf 'function add(a,b){return a+b}\nmodule.exports={add}\n' > calc.js
    printf 'const {add}=require("./calc");if(add(2,3)!==5){process.exit(1)}console.log("1 passed")\n' > calc.test.js
    git add -A && git commit -qm baseline
    # 未提交改动：引入 div 无 b==0 校验的边界问题，供 review 看
    printf 'function add(a,b){return a+b}\nfunction div(a,b){return a/b} // 无 b==0 校验\nmodule.exports={add,div}\n' > calc.js
  )
  echo "  fixture: $efix（未提交改动含 div 无零校验）"
  out="$(bash "$LOOP" --repo "$efix" --backend codex --max-rounds 1 --min-clean 1 --perspectives correct --test-cmd 'node calc.test.js' --backend-timeout 240 2>&1)"; rc=$?
  echo "$out" | tail -6 | sed 's/^/    | /'
  verdict="$(echo "$out" | grep -o '"finalVerdict":"[A-Z]*"' | tail -1)"
  # div 有 finding 时 1 轮内不会收敛；但 codex 是否**发现** div 问题依赖模型，故此处只断「未挂死 + 产出 finalVerdict」
  # （证明 codex 真驱动循环到判停）；收敛/非收敛的**确定性**正确性由离线 [3a]/[3a2] stub 覆盖，不押模型必中。
  if (( rc == 124 || rc == 137 )); then
    no "真 codex 端到端超时被 kill（rc=$rc）——codex 挂死（Windows 确认 bypass；否则 WSL）"
  elif [[ -n "$verdict" ]]; then
    ok "真 codex 端到端：codex 驱动循环产出 finalVerdict=$verdict（rc=$rc，未挂死）"
  else
    no "真 codex 端到端无 finalVerdict（rc=$rc）——疑似挂死/未产出结果"
  fi
fi

echo ""
if (( FAIL == 0 )); then echo "✅ 全部通过（$PASS 项）$([ "${LOOP_CODEX_E2E:-0}" != 1 ] && echo '；真 codex 端到端未跑，设 LOOP_CODEX_E2E=1 验完整链路')"; else echo "❌ $FAIL 项失败 / $PASS 通过 —— 见上"; fi
exit $(( FAIL == 0 ? 0 : 1 ))
