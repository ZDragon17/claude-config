#!/usr/bin/env bash
# =============================================================================
# autoresearch-loop.sh —— CLI 无关的自参考迭代循环（loop engineering 的可移植实现）
# -----------------------------------------------------------------------------
# 与 Claude Workflow 版（autoresearch-loop.mjs）同一套纪律，但：
#   · 后端可插拔：review/fix 的 agent 后端可选 codex / claude / opencode / ollama / gemini
#     · codex 后端(0.115+ 原生角色)：蜂群 review 走 explorer(-s read-only,物理禁写)、狼群 fix 走 worker
#       (-s workspace-write,可写)；并行 fanout 由 shell 编排、循环判停确定性掌控(不用 codex 内建 multi_agent 委派)。
#   · 证据由脚本自采：git hash-object 内容指纹 + 测试命令由 shell 直接跑 —— 不靠 agent 自报，
#     从根上消除 Workflow 版的「证据靠 agent 采集」「越界只能检测不能算准」两个工具天花板
#   · L1 纪律照搬：多视角审 → 去重/severity → 人工卡点 STOP → 分文件修 → 实证+测试 →
#     指纹越界检测 → verdict 判停；硬闸 = 轮数 + 调用次数（token proxy）
#
# 依赖：bash(>=4) git node + 至少一个 agent CLI。（JSON 处理全走 node，不依赖 jq）
# 用法：autoresearch-loop.sh --repo <path> [--test-cmd '...'] [--backend codex] ...
#       --help 看全部参数。
#
# 已知边界（诚实声明，非缺陷——是工具/语义取舍）：
#   · 审查/验证面 = **工作树**；已暂存(staged)且与工作树不同的内容不单独验证（baseline 会提示），
#     测试也跑工作树。指纹已同时纳入工作树 + 索引哈希以测出「只动 index」的越权。
#   · 被 .gitignore 的文件不在写检测范围内（fix prompt 明令只改分配文件；如 agent 写 .env 等忽略文件不报）。
#   · --test-cmd/--build-cmd 经 shell eval，仅传可信命令；含换行/制表符的文件名不支持。
#   · 默认串行修(per-file 强制 sound)；--parallel-fix 提速但同分配集内互改无法逐文件归属。
# =============================================================================
set -uo pipefail

# ---- 默认参数 ---------------------------------------------------------------
REPO="."
TEST_CMD=""
BUILD_CMD=""
SCOPE="git 未提交改动（working tree）"
GOAL="审出并修复高/中 severity 问题直到收敛"
MAX_ROUNDS=6
MIN_CLEAN=2
MAX_CALLS=0                       # 调用次数硬闸（token 预算 proxy）；0=不限
BACKEND="codex"                  # 默认 review+fix 后端
REVIEW_BACKEND=""                # 覆盖 review 后端
FIX_BACKEND=""                   # 覆盖 fix 后端
MODEL=""                         # ollama/部分后端的模型名
SERIAL_FIX=1                     # 默认串行修：逐文件 pre/post 快照强制 per-file 边界（sound）；--parallel-fix 提速
PERSPECTIVES="security,correct,arch"
BACKEND_TIMEOUT=600              # 单次 agent 调用超时(秒),0=不限；防挂死后端(如 codex 在原生 Windows 跑 shell 子进程会 stall)拖垮整个 loop
# 路径大小写：按平台自动（win/mac 不敏感、linux 敏感）；--case-sensitive 可强制敏感
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*|Darwin) CASE_INSENSITIVE=1 ;; *) CASE_INSENSITIVE=0 ;; esac

usage() {
  cat <<'EOF'
autoresearch-loop.sh — CLI 无关的自参考迭代循环

必填：
  --repo <path>           目标 git 仓库
常用：
  --test-cmd '<cmd>'      测试命令（在 repo 内跑，如 './mvnw test -pl m -am'）；不给则仅 diff 验证
  --build-cmd '<cmd>'     编译命令（参考用）
  --backend <name>        agent 后端：codex|claude|opencode|ollama|gemini（默认 codex）
  --review-backend <name> 单独指定 review 后端
  --fix-backend <name>    单独指定 fix 后端（须可写文件：codex|claude|opencode）
  --model <name>          模型名（ollama 等需要）
  --max-rounds <n>        轮数硬闸（默认 6，建议 ≤8）
  --min-clean <n>         连续几轮干净算收敛（默认 2）
  --max-calls <n>         agent 调用次数硬闸（token 预算 proxy；默认 0=不限）
  --backend-timeout <n>   单次 agent 调用超时秒数（默认 600，0=不限）；挂死后端不拖垮 loop（需 coreutils timeout）
  --perspectives a,b,c    视角：security,correct,arch（默认全开）
  --serial-fix            串行修（默认）：逐文件强制 per-file 写边界（sound）
  --parallel-fix          并行修（提速）：仅做「分配集之外」聚合越界检测，同集内互改无法归属
  --scope '<desc>'        审查范围描述
  --help

收敛 = 连续 min-clean 轮「全视角 H+M=0 且 测试不回退 且 无越界写」。
人工卡点（DDL/契约/金额/敏感路径）命中 → 立即 STOP 交人工。
注意：--test-cmd / --build-cmd 在仓库内经 shell eval 执行（等同本地跑该命令），仅传你信任的命令。
默认串行修=严格 per-file 写边界；要提速用 --parallel-fix（牺牲同分配集内的逐文件归属）。
EOF
}

# ---- 解析参数 ---------------------------------------------------------------
# 取值型选项缺参时友好报错（避免 set -u 下 $2 unbound 的难懂错误）
need_arg() { [[ $# -ge 2 ]] || { echo "错误：$1 需要一个参数" >&2; exit 2; }; }
while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) need_arg "$@"; REPO="$2"; shift 2;;
    --test-cmd) need_arg "$@"; TEST_CMD="$2"; shift 2;;
    --build-cmd) need_arg "$@"; BUILD_CMD="$2"; shift 2;;
    --backend) need_arg "$@"; BACKEND="$2"; shift 2;;
    --review-backend) need_arg "$@"; REVIEW_BACKEND="$2"; shift 2;;
    --fix-backend) need_arg "$@"; FIX_BACKEND="$2"; shift 2;;
    --model) need_arg "$@"; MODEL="$2"; shift 2;;
    --max-rounds) need_arg "$@"; MAX_ROUNDS="$2"; shift 2;;
    --min-clean) need_arg "$@"; MIN_CLEAN="$2"; shift 2;;
    --max-calls) need_arg "$@"; MAX_CALLS="$2"; shift 2;;
    --perspectives) need_arg "$@"; PERSPECTIVES="$2"; shift 2;;
    --backend-timeout) need_arg "$@"; BACKEND_TIMEOUT="$2"; shift 2;;
    --serial-fix) SERIAL_FIX=1; shift;;
    --parallel-fix) SERIAL_FIX=0; shift;;
    --case-sensitive) CASE_INSENSITIVE=0; shift;;
    --scope) need_arg "$@"; SCOPE="$2"; shift 2;;
    -h|--help) usage; exit 0;;
    *) echo "未知参数：$1" >&2; usage; exit 2;;
  esac
done

REVIEW_BACKEND="${REVIEW_BACKEND:-$BACKEND}"
FIX_BACKEND="${FIX_BACKEND:-$BACKEND}"
# fix 后端必须能写文件——ollama/gemini 是对话/补全 CLI，不可靠地编辑文件，拒之（review 后端不限）
case "$FIX_BACKEND" in codex|claude|opencode) ;; *) echo "错误：--fix-backend 须为可写文件的后端（codex|claude|opencode），不支持：$FIX_BACKEND" >&2; exit 2;; esac
# 钳制：非法数值一律 fail-closed（不静默回退，避免误传参意外放宽 hard stop）；10# 强制十进制防 08/09 八进制
[[ "$MAX_ROUNDS" =~ ^[0-9]+$ ]] || { echo "错误：--max-rounds 须为正整数" >&2; exit 2; }; MAX_ROUNDS=$((10#$MAX_ROUNDS))
(( MAX_ROUNDS < 1 )) && { echo "错误：--max-rounds 须 ≥ 1" >&2; exit 2; }; (( MAX_ROUNDS > 8 )) && MAX_ROUNDS=8
[[ "$MIN_CLEAN" =~ ^[0-9]+$ ]] || { echo "错误：--min-clean 须为正整数" >&2; exit 2; }; MIN_CLEAN=$((10#$MIN_CLEAN))
(( MIN_CLEAN < 1 )) && { echo "错误：--min-clean 须 ≥ 1" >&2; exit 2; }; (( MIN_CLEAN > MAX_ROUNDS )) && MIN_CLEAN=$MAX_ROUNDS
[[ "$MAX_CALLS" =~ ^[0-9]+$ ]] || { echo "错误：--max-calls 须为非负整数（0=不限）" >&2; exit 2; }
MAX_CALLS=$((10#$MAX_CALLS))
[[ "$BACKEND_TIMEOUT" =~ ^[0-9]+$ ]] || { echo "错误：--backend-timeout 须为非负整数（秒，0=不限）" >&2; exit 2; }; BACKEND_TIMEOUT=$((10#$BACKEND_TIMEOUT))
# 探测 coreutils timeout（Linux/mac/WSL/git-bash 的 /usr/bin/timeout 支持 `timeout <秒> <cmd>`；原生 Windows TIMEOUT.exe 语法不兼容→探测失败则不套超时）。
# TO 前缀包住每次后端 CLI：挂死的后端(如 codex 在原生 Windows stall)到点被 kill→返回空→该轮 INCONCLUSIVE/重试,绝不 deadlock 整个 loop。
TO=()   # 超时前缀数组（空=不套超时）；数组化避免 quoting 隐患（codex L2）
# 优先 GNU timeout（支持 -k）；macOS 用 brew install coreutils 装的是 gtimeout（名字不同），一并探测兜底
if (( BACKEND_TIMEOUT > 0 )); then
  if timeout -k 1s 0.1s true >/dev/null 2>&1; then TO=(timeout -k 10s "${BACKEND_TIMEOUT}s")
  elif gtimeout -k 1s 0.1s true >/dev/null 2>&1; then TO=(gtimeout -k 10s "${BACKEND_TIMEOUT}s"); fi   # -k：TERM 到点无效则 10s 后 SIGKILL 硬杀
fi
(( BACKEND_TIMEOUT > 0 )) && (( ${#TO[@]} == 0 )) && echo "⚠️ 未找到支持 -k 的 GNU timeout（原生 Windows 无；macOS 需 brew install coreutils 提供 gtimeout）：后端调用不设超时，挂死的 agent 会拖住本轮——建议 codex 后端在 WSL/Linux/mac(装 coreutils) 跑" >&2
# codex 沙箱按平台（实测 0.144.1）：原生 Windows 的 elevated 沙箱会 stall（pwsh 子进程挂死）→ 下方 bypass；Linux/mac/WSL 沙箱正常 → 角色沙箱。
case "$(uname -s 2>/dev/null)" in MINGW*|MSYS*|CYGWIN*) CODEX_WIN=1 ;; *) CODEX_WIN=0 ;; esac

for dep in git node; do command -v "$dep" >/dev/null || { echo "缺依赖：$dep" >&2; exit 3; }; done
# 后端 CLI 启动期 fail-fast（缺了直接报清楚，不要拖到多轮 INCONCLUSIVE 才暴露）
for be in "$REVIEW_BACKEND" "$FIX_BACKEND"; do
  command -v "$be" >/dev/null 2>&1 || { echo "错误：后端 CLI 未安装或不在 PATH：$be（用 --backend/--review-backend/--fix-backend 指定已装的）" >&2; exit 3; }
done
[[ -d "$REPO/.git" ]] || git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 || { echo "不是 git 仓库：$REPO" >&2; exit 3; }

WORKDIR="$(mktemp -d 2>/dev/null || mktemp -d -t alf)"
CALLS=0
cleanup() { rm -rf "$WORKDIR" 2>/dev/null; }
trap cleanup EXIT

# ---- 视角定义 ---------------------------------------------------------------
lens_of() {
  case "$1" in
    security) echo "安全：注入/SSRF/鉴权/密钥/OWASP Top 10";;
    correct)  echo "正确性：边界/并发/异常吞没/资源泄漏/逻辑错误";;
    arch)     echo "架构：SOLID/分层/契约/职责单一/可维护性";;
    *)        echo "通用代码审查";;
  esac
}

# ---- node 辅助库（嵌入，避免外挂文件）---------------------------------------
cat > "$WORKDIR/lib.js" <<'NODEEOF'
// extract <text>            : 从 stdin 文本里抠出第一个 JSON 值（fenced 或平衡括号）
// classify <gateMode>       : stdin=findings 数组 → {hm,gated,fixable,groups,H,M,L}
const fs = require('fs')
const mode = process.argv[2]
// 惰性读 stdin：仅消费 stdin 的模式(extract/isjson/validreview/classify/field/items/gatepath)才读；
// 纯 argv 模式(gatherfindings/uncovered/gatedscan)不读 → 交互终端下不会卡在等 EOF
let _inCache
const input = () => (_inCache === undefined ? (_inCache = fs.readFileSync(0, 'utf8')) : _inCache)

function scanBalanced(s) {  // 在 s 中找第一个能 JSON.parse 的完整 {…}/[…]
  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (c !== '{' && c !== '[') continue
    const open = c, close = c === '{' ? '}' : ']'
    let depth = 0, instr = false, esc = false
    for (let j = i; j < s.length; j++) {
      const d = s[j]
      if (instr) { if (esc) esc = false; else if (d === '\\') esc = true; else if (d === '"') instr = false; continue }
      if (d === '"') instr = true
      else if (d === open) depth++
      else if (d === close) { depth--; if (depth === 0) { const sub = s.slice(i, j + 1); try { JSON.parse(sub); return sub } catch (_) { break } } }
    }
  }
  return ''
}
function extractJSON(t) {
  // 候选：所有 ```fenced``` 块内容（逐个试，非只取第一个）+ 全文兜底
  const cands = []
  const re = /```(?:json)?\s*([\s\S]*?)```/gi
  let mm
  while ((mm = re.exec(t))) cands.push(mm[1])
  cands.push(t)
  for (const c of cands) { const r = scanBalanced(c); if (r) return r }
  return ''
}

const GATE_STRONG = new RegExp(
  '\\bALTER\\s+TABLE\\b|\\bDROP\\s+(?:TABLE|COLUMN|INDEX)\\b|\\bCREATE\\s+TABLE\\b|\\bTRUNCATE\\s+TABLE\\b|\\bDDL\\b' +
  '|\\b(?:UPDATE|DELETE)\\b[\\s\\S]{0,80}\\bWHERE\\b' +
  '|\\bSELECT\\b[\\s\\S]{0,120}\\b(?:SUM|COUNT|AVG)\\s*\\(' +
  '|\\b(?:flyway|liquibase)\\b|\\bMQTT\\s+(?:topic|payload|broker|消息|报文)')
const GATE_CJK = /金额|结算|计费|对账|收益|汇总|统计|报表|迁移脚本|批量(?:更新|删除)/
const GATE_IDENT = /\b(?:payment|settlement|invoice|ledger|openapi)\b|(?:Payment|Settlement|Invoice|Ledger|OpenAPI)|\b(?:payment|settlement|invoice|ledger|openapi)(?=[A-Z])/
const GATE_BALANCE = /\b(?:account|wallet|user|customer|closing|opening|available|ledger|trial|outstanding)[-_ ]?balance\b|\bbalance[-_ ]?(?:sheet|due|amount|owed)\b|余额|结余/i
const GATE_ACRONYM = /\b(?:DTO|VO)\b|(?<=[a-z])(?:DTO|VO)\b/
const GATE_CONTRACT_PATH = /(^|[\/._-])contracts?(?=[\/._-]|$)|(^|[\/._-])契约(?=[\/._-]|$)|\.proto$|openapi|swagger/i   // contract 锚到路径/文件名分隔符边界（Rev2-M2 放过 ContractService.java；codex-final-M1 仍命中 contract.yaml/user-contract.json/contracts 目录/契约/proto/openapi/swagger）
const GATE_PATH = /(^|\/)(migrations?|schema|ddl)(\/|$)|\.sql$|flyway|liquibase|docker-?compose|dockerfile|\.github\/workflows|jenkinsfile|(^|\/)application(?:-[\w]+)?\.ya?ml$|(^|\/)secrets?(\.|\/|$)|(^|\/)cron/i
const SEV = { H: 3, M: 2, L: 1 }
const ci = process.env.ALF_CI === '1'
const norm = p => { let s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim(); return ci ? s.toLowerCase() : s }
const isGated = f => { const t = `${f.title || ''} ${f.detail || ''} ${f.origFile ?? f.file ?? ''}`, p = norm(f.file); return GATE_STRONG.test(t) || GATE_CJK.test(t) || GATE_IDENT.test(t) || GATE_BALANCE.test(t) || GATE_ACRONYM.test(t) || GATE_CONTRACT_PATH.test(p) || GATE_PATH.test(p) }

if (mode === 'extract') { process.stdout.write(extractJSON(input())); process.exit(0) }

if (mode === 'isjson') { try { JSON.parse(input()); process.exit(0) } catch (_) { process.exit(1) } }

// 从多个 review 对象文件里抽 .findings 合并
if (mode === 'gatherfindings') {
  const out = []
  for (const fp of process.argv.slice(3)) {
    try { const o = JSON.parse(fs.readFileSync(fp, 'utf8')); if (o && Array.isArray(o.findings)) out.push(...o.findings) } catch (_) {}
  }
  process.stdout.write(JSON.stringify(out)); process.exit(0)
}

// severity 同义词归一（critical/high→H 等），无法识别的丢弃（不静默错计）
const SEVMAP = { H: 'H', M: 'M', L: 'L', CRITICAL: 'H', HIGH: 'H', MEDIUM: 'M', MED: 'M', MODERATE: 'M', LOW: 'L', INFO: 'L', MINOR: 'L' }
const normSev = s => SEVMAP[String(s || '').trim().toUpperCase()]

if (mode === 'validreview') {
  // argv[3]=changedSet 文件；有效 = reviewedFiles 非空 + findings 是数组 + reviewedFiles 与改动集有交集
  let o; try { o = JSON.parse(input()) } catch (_) { process.exit(1) }
  if (!o || !Array.isArray(o.reviewedFiles) || o.reviewedFiles.length === 0 || !Array.isArray(o.findings)) process.exit(1)
  // findings 非空时每项须格式合法（有 file/title + 可识别 severity），有畸形项 → 整个 review 判无效，不静默丢弃
  if (o.findings.some(f => !f || typeof f.file !== 'string' || !f.file || typeof f.title !== 'string' || !f.title || !normSev(f.severity))) process.exit(1)
  let changed = []
  try { changed = fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/).filter(Boolean) } catch (_) {}
  if (changed.length === 0) process.exit(0) // 拿不到改动集就只要求非空（兜底）
  const cset = new Set(changed.map(norm))
  process.exit(o.reviewedFiles.map(norm).some(p => cset.has(p)) ? 0 : 1)
}

// 人工卡点 fail-closed 预扫：扫**所有可解析** review（不论是否 valid）的 findings，输出命中卡点的
// （防 review 因元数据瑕疵被判无效后，其 DDL/契约/金额 finding 被静默丢弃绕过 human-gate）
if (mode === 'gatedscan') {
  const out = []
  for (const fp of process.argv.slice(3)) {
    try { const o = JSON.parse(fs.readFileSync(fp, 'utf8')); if (o && Array.isArray(o.findings))
      for (const f of o.findings) if (f && f.file && f.title && isGated({ ...f, origFile: f.file, file: norm(f.file) })) out.push(`[${f.severity || '?'}] ${norm(f.file)} :: ${f.title}`)
    } catch (_) {}
  }
  for (const l of [...new Set(out)]) console.log(l)
  process.exit(0)
}

// 覆盖检测（每视角×每文件）：argv[3]=changedSet，argv[4..]=各视角 review 文件；
// 输出「不是被**每个**视角都审到」的改动文件（任一视角漏审即算未覆盖，杜绝各扫一部分的假全覆盖）
if (mode === 'uncovered') {
  let changed = []
  try { changed = fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/).filter(Boolean).map(norm) } catch (_) {}
  const perRev = []
  for (const fp of process.argv.slice(4)) {
    try { const o = JSON.parse(fs.readFileSync(fp, 'utf8')); if (o && Array.isArray(o.reviewedFiles)) perRev.push(new Set(o.reviewedFiles.map(norm))) } catch (_) {}
  }
  if (perRev.length === 0) { changed.forEach(c => console.log(c)); process.exit(0) }
  for (const c of changed) if (!perRev.every(s => s.has(c))) console.log(c)
  process.exit(0)
}

if (mode === 'classify') {
  let arr = []
  try { arr = JSON.parse(input()) } catch (_) { arr = [] }
  // argv[3]=changedSet：finding.file 必须在本轮改动集内（防 reviewedFiles 蒙混 / finding 指向无关文件被分配修复）
  let cset = null
  try { const cs = fs.readFileSync(process.argv[3], 'utf8').split(/\r?\n/).filter(Boolean).map(norm); if (cs.length) cset = new Set(cs) } catch (_) {}
  arr = arr.filter(f => f && f.file && f.title && normSev(f.severity))
            .map(f => ({ ...f, origFile: f.file, file: norm(f.file), severity: normSev(f.severity) }))
            .filter(f => !f.file.split('/').includes('..'))   // 拒路径穿越段，而非误杀含 .. 的合法文件名
            .filter(f => !cset || cset.has(f.file))
  const m = new Map()
  for (const f of arr) {
    const k = `${f.file}::${String(f.title).slice(0, 30).toLowerCase()}::${f.line ?? ''}`
    const ex = m.get(k)
    if (!ex) { m.set(k, { ...f }); continue }
    if ((SEV[f.severity] || 0) > (SEV[ex.severity] || 0)) ex.severity = f.severity
    if (f.detail && !(ex.detail || '').includes(f.detail)) ex.detail = `${ex.detail || ''} | ${f.detail}`
  }
  const all = [...m.values()]
  const hm = all.filter(f => f.severity === 'H' || f.severity === 'M')
  const gated = all.filter(isGated)   // 任意 severity（含 L）命中卡点都拦——人工卡点是领域/路径属性，与严重度无关
  const fixable = hm.filter(f => !isGated(f))
  const itemsByFile = {}
  for (const f of fixable) {
    const line = `- [${f.severity}]${f.line ? ` L${f.line}` : ''} ${f.title}：${f.detail || ''}`
    itemsByFile[f.file] = (itemsByFile[f.file] ? itemsByFile[f.file] + '\n' : '') + line
  }
  process.stdout.write(JSON.stringify({
    H: hm.filter(f => f.severity === 'H').length,
    M: hm.filter(f => f.severity === 'M').length,
    L: all.filter(f => f.severity === 'L').length,
    hmCount: hm.length,
    ngated: gated.length,
    gatedText: gated.map(g => `  - [${g.severity}] ${g.file} :: ${g.title}`).join('\n'),
    fixableFiles: Object.keys(itemsByFile),
    itemsByFile,
  }))
  process.exit(0)
}

if (mode === 'field') {
  // 从 stdin JSON 取 argv[3] 字段：标量原样、数组换行拼接、对象 JSON
  let o = {}; try { o = JSON.parse(input()) } catch (_) {}
  const v = o[process.argv[3]]
  if (Array.isArray(v)) process.stdout.write(v.join('\n'))
  else if (v !== null && typeof v === 'object') process.stdout.write(JSON.stringify(v))
  else process.stdout.write(v == null ? '' : String(v))
  process.exit(0)
}

if (mode === 'items') {
  // 从 stdin classify JSON 取 itemsByFile[argv[3]]
  let o = {}; try { o = JSON.parse(input()) } catch (_) {}
  process.stdout.write((o.itemsByFile && o.itemsByFile[process.argv[3]]) || '')
  process.exit(0)
}

if (mode === 'gatepath') {   // fix 阶段 touched 越权写：复用完整 isGated（含 contract/proto/openapi/IDENT/ACRONYM），对齐 mjs gatedWrites(515)
  for (const line of input().split(/\r?\n/)) if (line && isGated({ file: line, origFile: line, title: '', detail: '' })) console.log(line)
  process.exit(0)
}
if (mode === 'gatebaseline') {   // 基线人工卡点：改动集里存在敏感**路径**(迁移/.sql/部署/生产配置/契约/proto/openapi)即输出→STOP，对齐 mjs 基线 path gate(GATE_PATH||GATE_CONTRACT_PATH)
  for (const line of input().split(/\r?\n/)) { const p = norm(line); if (line && (GATE_PATH.test(p) || GATE_CONTRACT_PATH.test(p))) console.log(line) }
  process.exit(0)
}
process.exit(1)
NODEEOF

export ALF_CI=$CASE_INSENSITIVE
nlib() { node "$WORKDIR/lib.js" "$@"; }

# ---- 后端调度 ---------------------------------------------------------------
# run_agent <mode:review|fix> <prompt>  → stdout 原始文本；mode=fix 时在 repo 内带写权限跑
# 调用计数走文件（子shell/命令替换里 +1 也不丢；wc -c 计数，含重试）
calls() { [[ -f "$WORKDIR/calls.cnt" ]] && { wc -c < "$WORKDIR/calls.cnt" | tr -d ' '; } || echo 0; }

run_agent() {
  local mode="$1" prompt="$2" be
  be=$([[ "$mode" == fix ]] && echo "$FIX_BACKEND" || echo "$REVIEW_BACKEND")
  # 硬闸兜底（原子）：mkdir 锁住 check+increment（mkdir 跨平台原子）；带上限自旋，防持锁者死亡后死等
  local _spin=0
  while ! mkdir "$WORKDIR/.calls.lock" 2>/dev/null; do _spin=$((_spin + 1)); (( _spin > 3000 )) && return 7; sleep 0.01 2>/dev/null || true; done  # 带 sleep 退避(不烧 CPU)，~30s 超时 fail-closed：拒发，绝不砸可能仍活着的锁
  if (( MAX_CALLS > 0 )) && (( $(calls) >= MAX_CALLS )); then rmdir "$WORKDIR/.calls.lock" 2>/dev/null; return 7; fi
  printf 'x' >> "$WORKDIR/calls.cnt"
  rmdir "$WORKDIR/.calls.lock" 2>/dev/null
  # review 与 fix 都在 repo 内跑：后端才看得到 git 改动 / 能写文件
  case "$be" in
    codex)
      # 蜂群=explorer / 狼群=worker（对齐 codex 0.115+ 角色）。沙箱按平台：
      #   · 原生 Windows：elevated 沙箱实测 stall（pwsh 子进程挂死）→ --dangerously-bypass-approvals-and-sandbox；
      #     安全**不靠** codex 沙箱,靠 shell 侧 git 指纹越界检测 + human-gate（review 期误写→Verify 判 INCONCLUSIVE）。
      #   · Linux/mac/WSL：-s read-only(蜂群,物理禁写) / -s workspace-write(狼群,可写)。
      # notify=[] 关掉 turn-ended computer-use hook（headless 会 spawn 挂住）；并行 fanout+判停由 shell 确定性掌控。
      local cxsb
      if (( CODEX_WIN )); then cxsb="--dangerously-bypass-approvals-and-sandbox"
      elif [[ "$mode" == fix ]]; then cxsb="-s workspace-write"
      else cxsb="-s read-only"; fi
      ( cd "$REPO" && printf '%s' "$prompt" | ${TO[@]+"${TO[@]}"} codex exec -c notify='[]' $cxsb --skip-git-repo-check - 2>>"$WORKDIR/backend.err" ) ;;
    claude)
      if [[ "$mode" == fix ]]; then
        ( cd "$REPO" && ${TO[@]+"${TO[@]}"} claude -p "$prompt" --permission-mode acceptEdits 2>>"$WORKDIR/backend.err" )
      else
        ( cd "$REPO" && ${TO[@]+"${TO[@]}"} claude -p "$prompt" 2>>"$WORKDIR/backend.err" )
      fi ;;
    opencode)  ( cd "$REPO" && ${TO[@]+"${TO[@]}"} opencode run "$prompt" 2>>"$WORKDIR/backend.err" ) ;;
    ollama)    ( cd "$REPO" && ${TO[@]+"${TO[@]}"} ollama run "${MODEL:-llama3.1}" "$prompt" 2>>"$WORKDIR/backend.err" ) ;;
    gemini)    ( cd "$REPO" && ${TO[@]+"${TO[@]}"} gemini -p "$prompt" 2>>"$WORKDIR/backend.err" ) ;;
    *) echo "未知后端：$be" >&2; return 1;;
  esac
}

# ask_json <mode> <prompt> → stdout 抠出的 JSON（失败返回空、退出码 1），最多重试 2 次
ask_json() {
  local mode="$1" prompt="$2" i out js rc
  for i in 1 2; do
    out="$(run_agent "$mode" "$prompt")"; rc=$?
    (( rc == 7 )) && return 7   # budget 拒发 → 直接上抛，调用方据此 STOP
    if (( rc == 124 || rc == 137 )); then printf '⚠️ 后端 %s 超时(rc=%s)被 kill，丢弃部分输出→重试/记 INCONCLUSIVE\n' "$mode" "$rc" >&2; continue; fi   # codex M2：超时/被杀绝不解析半截 stdout（否则可能把部分输出当有效结果）
    js="$(printf '%s' "$out" | nlib extract)"
    if [[ -n "$js" ]] && printf '%s' "$js" | nlib isjson; then
      printf '%s' "$js"; return 0
    fi
  done
  return 1
}

# ---- 脚本自采证据：测试 + 内容指纹（关键：不靠 agent 自报）-------------------
# run_tests → 设全局 TEST_GREEN/TEST_PASS/TEST_TOTAL/TEST_STAT
# 注：计数解析尽力而为（取最后一处摘要）。**主回退信号是退出码 TEST_GREEN**；
#     多模块/多 suite 聚合计数可能不精确（如某模块删测但末模块不变），此时以 green/red 为准。
#     需要严格按用例数判回退时，请用单一汇总输出的测试命令或显式 metric。
run_tests() {
  TEST_GREEN=true; TEST_PASS=-1; TEST_TOTAL=-1; TEST_STAT="N/A"; TEST_FE=-1   # TEST_FE = fail+error 数
  local out rc
  if [[ -n "$TEST_CMD" ]]; then
    out="$( cd "$REPO" && eval "$TEST_CMD" 2>&1 )"; rc=$?
    [[ $rc -eq 0 ]] && TEST_GREEN=true || TEST_GREEN=false
    local p f e pass fail
    # 1) Maven/surefire：Tests run: N, Failures: F, Errors: E, Skipped: S（Skipped 不算 pass，防 @Ignore 充数）
    p="$(printf '%s' "$out" | grep -oiE 'Tests run: [0-9]+' | tail -1 | grep -oE '[0-9]+' || echo '')"
    if [[ -n "$p" ]]; then
      local sk
      f="$(printf '%s' "$out" | grep -oiE 'Failures: [0-9]+' | tail -1 | grep -oE '[0-9]+' || echo '')"; f="${f:-0}"
      e="$(printf '%s' "$out" | grep -oiE 'Errors: [0-9]+' | tail -1 | grep -oE '[0-9]+' || echo '')"; e="${e:-0}"
      sk="$(printf '%s' "$out" | grep -oiE 'Skipped: [0-9]+' | tail -1 | grep -oE '[0-9]+' || echo '')"; sk="${sk:-0}"
      TEST_TOTAL=$(( p - sk )); TEST_PASS=$(( p - f - e - sk )); TEST_STAT="${TEST_PASS}/${f}/${e}"; TEST_FE=$(( f + e ))
    else
      # 2) 通用 "X passed" / "Y failed"（jest/vitest/pytest/mocha/go-test 等）
      pass="$(printf '%s' "$out" | grep -oiE '[0-9]+ passed' | tail -1 | grep -oE '[0-9]+' || echo '')"
      fail="$(printf '%s' "$out" | grep -oiE '[0-9]+ (failed|failures?)' | tail -1 | grep -oE '[0-9]+' || echo '')"
      if [[ -n "$pass" || -n "$fail" ]]; then
        pass="${pass:-0}"; fail="${fail:-0}"
        TEST_PASS="$pass"; TEST_TOTAL=$(( pass + fail )); TEST_STAT="${pass}/${fail}/0"; TEST_FE="$fail"
      fi
      # 3) 都抽不到 → 仅用退出码（TEST_PASS/TOTAL 保持 -1，回退检测退化为只看 green）
    fi
  elif [[ -n "$BUILD_CMD" ]]; then
    ( cd "$REPO" && eval "$BUILD_CMD" >/dev/null 2>&1 ); [[ $? -eq 0 ]] && TEST_GREEN=true || TEST_GREEN=false
  fi
}

# snapshot_fp → 写当前内容指纹到 $1（格式：path<TAB>blobhash）。
# 关键：用 git hash-object 取**内容哈希**（非增删行数，同计数改写也能测出）；
# 文件集 = git diff --name-only HEAD（含已暂存，防 stage 绕过）+ 未跟踪文件；磁盘已删的记 DELETED。
snapshot_fp() {
  local out="$1" f h ih base
  : > "$out"
  base="$( cd "$REPO" && git rev-parse --verify -q HEAD >/dev/null 2>&1 && echo HEAD || echo '' )"
  # 名单 = 工作树 vs HEAD + 已暂存(--cached，覆盖空仓库初始提交) + 未跟踪
  ( cd "$REPO" && { git diff --name-only $base 2>/dev/null; git diff --cached --name-only 2>/dev/null; git ls-files --others --exclude-standard 2>/dev/null; } ) \
    | sort -u | while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      # 工作树内容哈希
      if [[ -e "$REPO/$f" ]]; then h="$( cd "$REPO" && git hash-object -- "$f" 2>/dev/null )"; h="${h:-NOHASH}"; else h="DELETED"; fi
      # 索引(暂存)内容哈希——一并纳入指纹，使「只动 index」的越权也能测出（防 stage 后还原工作树逃检）
      ih="$( cd "$REPO" && git ls-files -s -- "$f" 2>/dev/null | awk '{print $1":"$2}' | head -1 )"  # mode:sha，连文件模式变化(chmod 暂存)也纳入指纹
      printf '%s\t%s\tidx:%s\n' "$f" "$h" "${ih:-NONE}" >> "$out"
  done
  if [[ "$CASE_INSENSITIVE" == "1" ]]; then
    awk -F'\t' '{print tolower($1)"\t"$2"\t"$3}' "$out" | sort -u > "$out.tmp" && mv "$out.tmp" "$out"
  else
    sort -u "$out" -o "$out"
  fi
}

# fp_touched <fpA> <fpB> → stdout：两快照间被触动的路径（对称差取 path 列去重）。抽自原两处等价内联。
fp_touched() { { comm -23 "$1" "$2"; comm -13 "$1" "$2"; } | awk -F'\t' '{print $1}' | sort -u; }

# ---- verdict 颜色/日志 ------------------------------------------------------
log() { printf '%s\n' "$*"; }

# =============================================================================
# 主流程
# =============================================================================
# 视角解析 + 校验：去空白/空项，空列表直接报错（防 0 reviewer 满额假收敛）
IFS=',' read -ra _RAWP <<< "$PERSPECTIVES"
PERS=()
for _p in "${_RAWP[@]}"; do _p="$(echo "$_p" | tr -d '[:space:]')"; [[ -n "$_p" ]] && PERS+=("$_p"); done
NPERS=${#PERS[@]}
(( NPERS == 0 )) && { echo "错误：--perspectives 为空，至少需要一个视角" >&2; exit 2; }
: > "$WORKDIR/calls.cnt"   # 调用计数初始化
log "autoresearch-loop.sh 启动 | repo=$REPO | backend=review:$REVIEW_BACKEND/fix:$FIX_BACKEND | 视角×$NPERS | maxRounds=$MAX_ROUNDS minClean=$MIN_CLEAN | metric=连续${MIN_CLEAN}轮 H+M=0 且不回退 且无越界"

# ---- 基线（脚本自采）-------------------------------------------------------
run_tests
BASE_GREEN=$TEST_GREEN; BASE_PASS=$TEST_PASS; BASE_TOTAL=$TEST_TOTAL; BASE_FE=$TEST_FE
# B1 边界提示：本 loop 以**工作树**为准、测试跑工作树；若有已暂存(staged)且与工作树不同的内容，不单独验证
( cd "$REPO" && ! git diff --cached --quiet 2>/dev/null ) && log "⚠️ 检测到已暂存改动：本 loop 以工作树为审查/验证面，暂存区内容不单独验证（如需纳入请先 git restore --staged 统一到工作树）"
snapshot_fp "$WORKDIR/base.fp"
BASE_FILES=$(wc -l < "$WORKDIR/base.fp" | tr -d ' ')
log "基线：testGreen=$BASE_GREEN testStat=$TEST_STAT | 已有改动 $BASE_FILES 文件"
if [[ "$BASE_FILES" -eq 0 ]]; then
  log "NOOP：工作树无未提交改动，无可审对象"
  echo '{"finalVerdict":"NOOP","rounds":0,"reason":"工作树无改动可审"}'
  exit 0
fi
# 基线红 + 无法解析用例数 → 无法可靠判回退（只能靠 green→red，但基线已 red 永不触发）→ fail-closed
if [[ -n "$TEST_CMD" && "$BASE_GREEN" == "false" && "$BASE_PASS" -lt 0 ]]; then
  log "STOP：测试基线为红且无法解析用例数（pass/fail/total），无法可靠判回退。请改用能解析计数的测试命令，或先把基线修绿再跑。"
  echo '{"finalVerdict":"STOP","rounds":0,"reason":"red baseline without parseable test counts"}'
  exit 1
fi
LAST_TRUSTED_PASS=$BASE_PASS; LAST_TRUSTED_GREEN=$BASE_GREEN; LAST_TRUSTED_FE=$BASE_FE

ROUND=0; CLEAN=0; INCONCLUSIVE=0; COVGAP=0; CONSEC_REGRESS=0; STOP_REASON=""; FINAL="HOLD"
GATED_REPORT=""

while (( ROUND < MAX_ROUNDS && CLEAN < MIN_CLEAN )); do
  # 调用次数硬闸（token proxy）：预留本轮 review 最坏情况 = 2×视角数（每个 ask_json 至多重试 2 次）
  if (( MAX_CALLS > 0 )) && (( $(calls) + 2 * NPERS > MAX_CALLS )); then
    STOP_REASON="调用次数预算不足（已用 $(calls) / 上限 $MAX_CALLS）"; log "STOP：$STOP_REASON"; break
  fi
  ROUND=$((ROUND + 1))
  # 轮首快照（fix 之前的状态）：既作 reviewedFiles 交集校验的改动集，也作越界判定的前置基准
  snapshot_fp "$WORKDIR/pre.fp"
  awk -F'\t' '{print $1}' "$WORKDIR/pre.fp" > "$WORKDIR/changed_set.txt"
  # COVGAP 专用 tracked-only 集：未跟踪文件第 3 列恒为 idx:NONE（git ls-files -s 无输出），排除之。
  # 对齐 mjs trackedChangedSet：reviewer 跑 git diff 看不到 untracked，纳入覆盖要求会每轮误判缺审 → 误 STOP。
  awk -F'\t' '$3!="idx:NONE"{print $1}' "$WORKDIR/pre.fp" > "$WORKDIR/tracked_set.txt"
  # codex-H1：基线人工卡点——改动集**存在**敏感路径(迁移/.sql/schema/ddl/部署/生产配置/契约/proto/openapi)即 STOP，
  # 不依赖 reviewer 是否报 finding（预存在的敏感改动未被任一视角标注也须交人工，对齐 mjs 基线 path gate + human-gate 卡点2/3）
  BSGATE="$(nlib gatebaseline < "$WORKDIR/changed_set.txt")"
  if [[ -n "$BSGATE" ]]; then
    GATED_REPORT="$BSGATE"
    STOP_REASON="改动集含敏感路径文件（未经 reviewer 标注也须交人工）：$(printf '%s' "$BSGATE" | paste -sd, -)"
    log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; log "$BSGATE"; FINAL="STOP"; break
  fi
  log ""; log "──────── Round $ROUND ────────"

  # ---- 1. 多视角审（并行）----
  : > "$WORKDIR/findings.json"
  pids=(); idx=0
  for per in "${PERS[@]}"; do
    lens="$(lens_of "$per")"
    prompt="你是「${lens}」视角的 reviewer。仓库根：${REPO}，审查范围：${SCOPE}。
先在该仓库跑 git status 与 git diff 看实际改动，**逐一审查每一个改动文件**（从你这个视角），reviewedFiles 必须列全你审过的每个改动文件——漏掉任何一个改动文件，本视角本轮判覆盖不全。
只输出一个 JSON 对象（不要别的文字）：
{\"reviewedFiles\":[你实际看过的文件相对路径...],\"findings\":[{\"title\",\"file\"(相对仓库根路径),\"line\"(可选),\"severity\"(H/M/L),\"detail\"}...]}
reviewedFiles **不能为空**（空=没真审，本视角判无效不计入收敛）。findings 按 severity 排序，最多 12 条，不要凑数。
severity：H=必修(安全/数据正确性/崩溃)，M=应修(逻辑/资源/契约风险)，L=可选。"
    ( ask_json review "$prompt" > "$WORKDIR/rev_$idx.json" 2>/dev/null || echo "" > "$WORKDIR/rev_$idx.json" ) &
    pids+=($!); idx=$((idx + 1))
  done
  for p in "${pids[@]}"; do wait "$p"; done

  # review 必须只读：在判 quorum **之前**先验工作树是否被 review 改动（防写型后端改完返回垃圾绕过检测）→ STOP fail-closed
  snapshot_fp "$WORKDIR/postrev.fp"
  if ! diff -q "$WORKDIR/pre.fp" "$WORKDIR/postrev.fp" >/dev/null 2>&1; then
    STOP_REASON="review 阶段改动了工作树（review 后端必须只读，疑似写型后端越权）"
    log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; FINAL="STOP"; break
  fi

  # 人工卡点 fail-closed 预扫：先扫**所有可解析** review（不论 valid）的 gated finding，命中即 STOP（最高优先）
  GSCAN="$(nlib gatedscan "$WORKDIR"/rev_*.json 2>/dev/null)"
  if [[ -n "$GSCAN" ]]; then
    GATED_REPORT="$GSCAN"
    STOP_REASON="检测到人工卡点 finding（DDL/契约/金额/敏感路径），按 human-gate 停下交人工"
    log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; log "$GSCAN"; FINAL="STOP"; break
  fi

  # 汇总有效视角（对象 + reviewedFiles 非空 + 与本轮改动集有交集，防偷懒/不相干审查 → 假收敛）
  RESPONDED=0; validfiles=()
  for ((i=0;i<NPERS;i++)); do
    if [[ -s "$WORKDIR/rev_$i.json" ]] && nlib validreview "$WORKDIR/changed_set.txt" < "$WORKDIR/rev_$i.json"; then
      RESPONDED=$((RESPONDED + 1)); validfiles+=("$WORKDIR/rev_$i.json")
    fi
  done
  if (( ${#validfiles[@]} > 0 )); then nlib gatherfindings "${validfiles[@]}" > "$WORKDIR/all.json"; else echo "[]" > "$WORKDIR/all.json"; fi

  # ---- 分类 + 人工卡点 STOP（**最先**，任一有效视角报的卡点都拦，不受 quorum/coverage 的 continue 影响）----
  nlib classify "$WORKDIR/changed_set.txt" < "$WORKDIR/all.json" > "$WORKDIR/cls.json"
  H=$(nlib field H < "$WORKDIR/cls.json"); M=$(nlib field M < "$WORKDIR/cls.json"); L=$(nlib field L < "$WORKDIR/cls.json")
  HM=$(nlib field hmCount < "$WORKDIR/cls.json"); NGATED=$(nlib field ngated < "$WORKDIR/cls.json")
  [[ "$HM" =~ ^[0-9]+$ ]] || HM=1; [[ "$NGATED" =~ ^[0-9]+$ ]] || NGATED=1   # RevAll1-L2 fail-closed：解析缺失/非数值→HM 记非收敛、NGATED 记有卡点，绝不因空串被 bash 当 0 误判 CONVERGED/漏卡点
  if (( NGATED > 0 )); then
    GATED_REPORT="$(nlib field gatedText < "$WORKDIR/cls.json")"
    STOP_REASON="检测到 $NGATED 条人工卡点 finding（DDL/契约/金额/敏感路径），按 human-gate 停下交人工"
    log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; log "$GATED_REPORT"; FINAL="STOP"; break
  fi

  # ---- 视角不全 → INCONCLUSIVE（重置 COVGAP，保证 coverage 的「连续」语义）----
  if (( RESPONDED < NPERS )); then
    INCONCLUSIVE=$((INCONCLUSIVE + 1)); COVGAP=0; CLEAN=0
    log "r$ROUND verdict: INCONCLUSIVE  evidence: 仅 $RESPONDED/$NPERS 视角有效响应"
    if (( INCONCLUSIVE >= 2 )); then STOP_REASON="连续 2 轮视角不全，无法可靠判停"; log "STOP：$STOP_REASON"; break; fi
    continue
  fi
  INCONCLUSIVE=0

  # ---- 覆盖强制（每视角×每文件：每个改动文件须被**每个**视角都审到）独立计数 COVGAP ----
  # 防"各视角各扫一部分、合起来看似全覆盖、实则某文件没过某个 lens"的假收敛；连续 2 轮 STOP 交人工缩 scope。
  UNCOV="$(nlib uncovered "$WORKDIR/tracked_set.txt" "${validfiles[@]}")"
  if [[ -n "$UNCOV" ]]; then
    COVGAP=$((COVGAP + 1)); CLEAN=0
    log "r$ROUND verdict: INCONCLUSIVE  evidence: 改动文件未被每个视角审到（缺审：$(printf '%s' "$UNCOV" | paste -sd, -)）"
    if (( COVGAP >= 2 )); then STOP_REASON="连续 2 轮覆盖不全（部分改动文件无人审），交人工缩小 scope 或补视角"; log "STOP：$STOP_REASON"; break; fi
    continue
  fi
  COVGAP=0

  # ---- 2. 分文件修（并行/串行）----
  mapfile -t FIXFILES < <(nlib field fixableFiles < "$WORKDIR/cls.json")
  ASSIGNED_NOW="$WORKDIR/assigned_now.txt"; : > "$ASSIGNED_NOW"
  if (( ${#FIXFILES[@]} > 0 )); then
    for f in "${FIXFILES[@]}"; do printf '%s\n' "$f" >> "$ASSIGNED_NOW"; done
    if (( MAX_CALLS > 0 )) && (( $(calls) + ${#FIXFILES[@]} > MAX_CALLS )); then
      STOP_REASON="预算不足以覆盖本轮 ${#FIXFILES[@]} 个修复"; log "STOP：$STOP_REASON"; FINAL="STOP"; break
    fi
    mkfprompt() {  # 生成单文件 fix prompt
      local f="$1" items others
      items="$(nlib items "$f" < "$WORKDIR/cls.json")"
      others="$(printf '%s\n' "${FIXFILES[@]}" | grep -vxF -- "$f" | paste -sd, - 2>/dev/null || true)"
      printf '只修这一个文件：%s（相对仓库根）。禁止改其它文件（%s）以及任何 DDL/迁移/.sql/契约/金额相关文件。\n要修的问题：\n%s\n直接编辑文件修复，改完简述改动。不要废话。' "$f" "${others:-无}" "$items"
    }
    if (( SERIAL_FIX == 1 )); then
      # 串行：逐文件 pre/post 快照，**强制每个 agent 只动它那一个文件**（真·per-file 边界，并行无法归属）
      SFVIOL=""
      for f in "${FIXFILES[@]}"; do
        snapshot_fp "$WORKDIR/sf_pre.fp"
        run_agent fix "$(mkfprompt "$f")" >/dev/null 2>&1 || { SFVIOL="fix agent 调用失败/预算耗尽($f)"; break; }
        snapshot_fp "$WORKDIR/sf_post.fp"
        fp_touched "$WORKDIR/sf_pre.fp" "$WORKDIR/sf_post.fp" | grep -vxF -- "$f" > "$WORKDIR/sf_viol.txt" || true
        if [[ -s "$WORKDIR/sf_viol.txt" ]]; then SFVIOL="agent[$f] 越界改了 $(paste -sd, "$WORKDIR/sf_viol.txt")"; break; fi
      done
      if [[ -n "$SFVIOL" ]]; then
        STOP_REASON="serial per-file 违规：$SFVIOL，按纪律停下交人工"
        log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; FINAL="STOP"; break
      fi
    else
      # 并行：聚合越界检测（catch 改到本轮分配集**之外**的文件；同分配集内 agent 互改对方文件无法归属——要严格用 --serial-fix）
      pids=()
      for f in "${FIXFILES[@]}"; do ( run_agent fix "$(mkfprompt "$f")" >/dev/null 2>&1 ) & pids+=($!); done
      FIXFAIL=0
      for p in "${pids[@]}"; do wait "$p" || FIXFAIL=1; done   # 捕获 fix 失败/预算拒发(return 7)
      if (( FIXFAIL )); then
        STOP_REASON="并行 fix 有 agent 调用失败/预算耗尽"
        log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; FINAL="STOP"; break
      fi
    fi
  fi

  # ---- 3. 验证（脚本自采）----
  # 越界/敏感写检测只在「本轮真派了 fix」时做：没派 fix 就没有「本 loop 的写入」可追责，
  # 不去 police 外部工具/hook 造成的工作树漂移（避免干净轮误 STOP）。指纹只覆盖工作树内容
  # （fix agent 编辑的就是工作树文件；不追索引/暂存区的单独操作——agent 不会动 git index）。
  if (( ${#FIXFILES[@]} > 0 )); then
    # fix 后快照，与轮首 pre.fp 比 → 精确得到「本轮 fix 改了什么」（测试还没跑，副作用文件不会混入）
    snapshot_fp "$WORKDIR/cur.fp"
    fp_touched "$WORKDIR/pre.fp" "$WORKDIR/cur.fp" > "$WORKDIR/touched.txt"

    # ① fix 越权写敏感文件（DDL/迁移/.sql）→ STOP 交人工
    GW="$(nlib gatepath < "$WORKDIR/touched.txt")"
    if [[ -n "$GW" ]]; then
      STOP_REASON="修复触及敏感文件（DDL/迁移/.sql）：$(printf '%s' "$GW" | paste -sd, -)，按 human-gate 停下交人工"
      log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; FINAL="STOP"; break
    fi
    # ② 越界写（改了本轮分配外文件）→ STOP 交人工（精确整行匹配；按行计数防空格误计）
    : > "$WORKDIR/outside.txt"
    while IFS= read -r tf; do
      [[ -z "$tf" ]] && continue
      grep -qxF -- "$tf" "$ASSIGNED_NOW" 2>/dev/null || printf '%s\n' "$tf" >> "$WORKDIR/outside.txt"
    done < "$WORKDIR/touched.txt"
    NOUT=$(grep -c . "$WORKDIR/outside.txt" 2>/dev/null); NOUT=${NOUT:-0}
    if (( NOUT > 0 )); then
      STOP_REASON="检测到 $NOUT 个越界写（改了分配外文件）：$(paste -sd, "$WORKDIR/outside.txt")，按纪律停下交人工"
      log "r$ROUND verdict: STOP  evidence: $STOP_REASON"; FINAL="STOP"; break
    fi
  fi

  # 跑测试做回退判定（测试副作用不污染越界快照）
  run_tests
  REGRESSED=0
  if [[ "$BASE_GREEN" == "true" && "$TEST_GREEN" == "false" ]]; then REGRESSED=1; fi
  if (( BASE_PASS >= 0 )) && (( TEST_PASS >= 0 )) && (( TEST_PASS < BASE_PASS )); then REGRESSED=1; fi
  if (( BASE_TOTAL >= 0 )) && (( TEST_TOTAL >= 0 )) && (( TEST_TOTAL < BASE_TOTAL )); then REGRESSED=1; fi
  if (( LAST_TRUSTED_PASS >= 0 )) && (( TEST_PASS >= 0 )) && (( TEST_PASS < LAST_TRUSTED_PASS )); then REGRESSED=1; fi
  if (( BASE_FE >= 0 )) && (( TEST_FE >= 0 )) && (( TEST_FE > BASE_FE )); then REGRESSED=1; fi
  # 相对**上一可信状态**判回退（抓 red→green→red：基线红、中途转绿、又退回红/变差）
  if [[ "$LAST_TRUSTED_GREEN" == "true" && "$TEST_GREEN" == "false" ]]; then REGRESSED=1; fi
  if (( LAST_TRUSTED_FE >= 0 )) && (( TEST_FE >= 0 )) && (( TEST_FE > LAST_TRUSTED_FE )); then REGRESSED=1; fi
  if [[ "$TEST_GREEN" == "false" && "$TEST_PASS" -lt 0 ]]; then REGRESSED=1; fi                  # 红且计数不可解析 → 保守判回退

  # ---- 4. verdict（到此必无越界/敏感写，已 STOP 过滤）----
  if (( REGRESSED == 1 )); then CONSEC_REGRESS=$((CONSEC_REGRESS + 1)); else CONSEC_REGRESS=0; fi
  if (( HM == 0 )) && (( REGRESSED == 0 )); then
    CLEAN=$((CLEAN + 1)); VERDICT="CONVERGED"
  else
    CLEAN=0
    if (( CONSEC_REGRESS >= 2 )); then VERDICT="STOP"; STOP_REASON="连续 2 轮测试回退，防震荡"; else VERDICT="HOLD"; fi
  fi
  # 未回退才更新「可信状态」基准（trusted = 最近一次没退步的状态）
  if (( REGRESSED == 0 )); then
    LAST_TRUSTED_GREEN=$TEST_GREEN
    (( TEST_PASS > LAST_TRUSTED_PASS )) && LAST_TRUSTED_PASS=$TEST_PASS
    if (( TEST_FE >= 0 )); then (( LAST_TRUSTED_FE < 0 || TEST_FE < LAST_TRUSTED_FE )) && LAST_TRUSTED_FE=$TEST_FE; fi
  fi

  log "r$ROUND verdict: $VERDICT (clean=$CLEAN/$MIN_CLEAN)  evidence: H=$H M=$M L=$L | test=$TEST_STAT$([[ $REGRESSED == 1 ]] && echo ' (回退!)')"
  if [[ "$VERDICT" == "STOP" ]]; then FINAL="STOP"; log "STOP：$STOP_REASON"; break; fi
done

# ---- 收尾 ------------------------------------------------------------------
if (( CLEAN >= MIN_CLEAN )); then FINAL="CONVERGED"
elif [[ -z "$STOP_REASON" ]] && (( ROUND >= MAX_ROUNDS )); then STOP_REASON="达轮数上限 $MAX_ROUNDS 仍未收敛"; FINAL="STOP"
elif [[ -n "$STOP_REASON" ]]; then FINAL="STOP"; fi

log ""; log "═══════════════════════════════════════"
log "结束：$FINAL | 共 $ROUND 轮 | agent 调用 $(calls) 次 | ${STOP_REASON:-已收敛}"
[[ -n "$GATED_REPORT" ]] && { log "人工卡点需处理："; log "$GATED_REPORT"; }
# final JSON 用 node 生成，正确转义 reason（避免手拼 JSON 被特殊字符破坏）
node -e 'const a=process.argv.slice(1);process.stdout.write(JSON.stringify({finalVerdict:a[0],rounds:+a[1],calls:+a[2],cleanRounds:+a[3],reason:a[4]||"converged"})+"\n")' \
  "$FINAL" "$ROUND" "$(calls)" "$CLEAN" "${STOP_REASON:-converged}"
[[ "$FINAL" == "CONVERGED" ]] && exit 0 || exit 1
