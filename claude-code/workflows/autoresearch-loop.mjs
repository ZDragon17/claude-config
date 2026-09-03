// =============================================================================
// autoresearch-loop —— 把「自参考迭代循环」从「模型自觉」升级为「脚本强制」
// -----------------------------------------------------------------------------
// 运行时：本文件是 Workflow 工具脚本，运行时把脚本体包进 async 函数执行，故**顶层 return 合法**
//   （与官方示例一致），`export const meta` 为必需纯字面量导出。
//
// 能力边界（诚实声明，两层保证，勿当未披露缺陷）：Workflow 脚本只能经 agent() 跑命令、无 shell 原语，
//   也无法在并行写主树时做逐 agent 文件归属。所以：
//   (1) 控制流确定性——循环/计数/判停/卡点/预算/钳制，模型无法绕过。
//   (2) 写入与证据——**只能事后检测，不能物理阻止**：
//       · 越界写检测：每文件**内容哈希指纹（agent 报 git hash-object，无则回落 numstat ±行数）**比对，凡指纹相对
//         上一可信状态变化且**不在当轮分配集**即判越界；越界轮不计收敛、且**不滚动指纹基准** → 该越界文件每轮都被
//         re-flag → **永不假收敛**。内容哈希能测出「同增删行数的原地改写」（numstat 盲区已补）。
//         （能保证「检测到即拒绝收敛」，但不能阻止写发生，也**无法识别「分配集内两 agent 互改对方文件」**这类
//          同集内串写——需 serialFix 降低竞争，或 worktree+逐文件 merge 才能物理阻止，Workflow 暂不支持；
//          另 sha 由 agent 自采，与测试计数同属「证据自采」天花板，靠哨兵+交叉校验兜底）。
//       · 证据糊弄检测：哨兵整行 + 三元组交叉校验。
//   这些是工具天花板，已显式声明，文档不夸大为「强制阻止」。
//
// 单轮 = 蜂群多视角审(并行,需 reviewedFiles 证明真看了) → 去重(保全 H/M) → 命中人工卡点 STOP
//        → 狼群按文件分工修 → numstat 实证+测试+哨兵交叉校验+指纹越界检测 → verdict
// 收敛 = 连续 minCleanRounds 轮「全视角到齐 且 H+M=0 且 不回退 且 无越界写 且 证据可信」。
// 硬闸 = maxRounds 轮上限 + token 预算（启动/首轮放大 + Fix 前投影 + 轮间滚动均值）。
// =============================================================================

export const meta = {
  name: 'autoresearch-loop',
  description: '自参考迭代循环：蜂群审→狼群修→git diff 验证→测试→verdict 判停，带轮数+token 双硬闸',
  phases: [
    { title: 'Baseline', detail: '采集测试基线与已有改动指纹（失败即 STOP）' },
    { title: 'Review', detail: '蜂群多视角并行审查（需 reviewedFiles 证明）' },
    { title: 'Fix', detail: '狼群按文件分工修复（in-place file-disjoint fanout）' },
    { title: 'Verify', detail: 'numstat 实证 + 测试 + 交叉校验 + 指纹越界检测' },
    { title: 'Judge', detail: 'verdict 判停：CONVERGED / HOLD / INCONCLUSIVE / STOP' },
  ],
}

// ---- 入参（args）默认值，含健壮性钳制 ---------------------------------------
const repo      = args?.repo      ?? '.'
const testCmd   = args?.testCmd   ?? null
const buildCmd  = args?.buildCmd  ?? null
const scope     = args?.scope     ?? 'git status 未提交改动'
const goal      = args?.goal      ?? '审出并修复高/中severity问题直到收敛'
const metric    = args?.metric    ?? '连续 2 轮全视角到齐 且 H+M=0 且 测试不回退 且 无越界写'
const maxRounds = Math.max(1, Math.min(Math.floor(Number(args?.maxRounds)) || 6, 8))
const minClean  = Math.min(maxRounds, Math.max(1, Math.floor(Number(args?.minCleanRounds)) || 2))
const tokenFloor = Math.max(1, Math.floor(Number(args?.perRoundTokenFloor)) || 60_000)
// serialFix 默认 false（并行修，快）。注意：与 L3 sh 版默认 true 相反——sh 靠 shell 逐文件 pre/post 快照做
// 真·per-file 归属，serialFix 能给它 sound 边界；mjs 无 shell 原语，serialFix=true 只能串行化降低竞争窗口、
// 给不了等价归属，故默认不牺牲速度。同集内两 agent 互改对方文件仍是盲区（越界检测抓不到同集内），
// 要严格边界用 serialFix:true 降竞争，或走 sh 版。同增删行数的原地改写盲区已由内容哈希指纹消除。
const serialFix = args?.serialFix === true
const caseSensitivePaths = args?.caseSensitivePaths === true   // 默认大小写不敏感（win32/mac 安全）
const expectTests = testCmd != null

// 2.1.199 起 subagent 命中 API 错误（用量上限/服务端错误/被限流截断）会把错误**上报父级**（旧版会静默吞成
// 假成功或 null）。Workflow 里这体现为 agent() 可能 throw：一旦在 parallel() 或 await 中抛出，整个 loop 直接
// 崩溃、丢掉 history/verdict。故循环内所有 agent() 调用一律经 safeAgent 兜底——throw 降级为 null，复用既有
// 「返回 null」的 fail-closed 路径：review→视角掉线不计 quorum→INCONCLUSIVE（绝不当收敛）、verify→STOP、
// fix→该问题留到下轮重审。语义与原「agent 返回 null」完全一致，纯属抗崩溃加固，不改判停逻辑。
const safeAgent = async (...a) => {
  try { return await agent(...a) }
  catch (e) { log(`⚠️ agent 调用抛错（降级 null，本轮不计收敛）[${e?.name || 'Error'}${e?.status ? ' ' + e.status : ''}]：${String(e?.message || e).slice(0, 300)}`); return null }
}

// Task0：默认视角用 general-purpose（继承会话模型），不用 security/code/architect-reviewer 专用 agent
// ——后者在部分环境被 pin 到不可用模型会 404；视角区分靠 lens 字段，不靠 agentType（本会话实证 general-purpose/task 可靠）。
const DEFAULT_PERSPECTIVES = [
  { key: 'security', agentType: 'general-purpose', lens: '安全：注入/SSRF/鉴权/密钥/OWASP Top 10',
    stance: '去相关策略：先对每个改动文件做 STRIDE 快速走查（仿冒/篡改/抵赖/信息泄露/DoS/提权），走查不出攻击面才允许报 0 finding；对任何用户输入流入的路径默认假设输入恶意。' },
  { key: 'correct',  agentType: 'general-purpose', lens: '正确性：边界/并发/异常吞没/资源泄漏/逻辑错误',
    stance: '去相关策略：先为每个改动文件写一句「为什么这里不可能出 bug」的辩护词，再逐条尝试反驳；反驳成功才算 finding。涉及共享状态/异步/事务的代码默认存在竞态，除非你能指出具体保护机制。' },
  { key: 'arch',     agentType: 'general-purpose', lens: '架构：SOLID/分层/契约/职责单一/可维护性',
    stance: '去相关策略：先画出改动涉及模块的实际依赖方向再判断是否引入新耦合；只报会造成实际维护成本的架构问题，不报纯品味问题。' },
]
const KNOWN_AGENTS = new Set(['security-reviewer', 'code-reviewer', 'architect-reviewer', 'general-purpose'])
// 注：白名单仍保留 security/code/architect-reviewer 作向后兼容（某些环境这些 agent 可用）；但**显式**传这些名在缺该 agent 的环境仍可能 404（风险自负）。默认视角与 typo 回落都走 general-purpose（见上）。
const normPerspective = (p, i) => ({
  key:       (p && p.key)       || `p${i}`,
  // agentType 须在注册表内，否则回落 general-purpose（会话模型，避免 pin 死的专用 reviewer 在部分环境 404 → 莫名 INCONCLUSIVE）
  agentType: (p && KNOWN_AGENTS.has(p.agentType)) ? p.agentType : 'general-purpose',
  lens:      (p && p.lens)      || '通用代码审查',
  stance:    (p && p.stance)    || '',   // 对抗性立场（去相关）：同基座多视角会犯相关错误，强制各 lens 先自辩再反驳
})
const PERSPECTIVES = (Array.isArray(args?.perspectives) && args.perspectives.length > 0
  ? args.perspectives : DEFAULT_PERSPECTIVES).slice(0, 6).map(normPerspective)

// 人工卡点（human-gate.md）。命中即整 loop STOP 交人工 → 偏保守。
// 强信号：SQL DDL/DML 大写敏感（散文小写 update...where 不命中）；聚合须 SQL 上下文；MQTT 限定语义
const GATE_STRONG = new RegExp(
  '\\bALTER\\s+TABLE\\b|\\bDROP\\s+(?:TABLE|COLUMN|INDEX)\\b|\\bCREATE\\s+TABLE\\b|\\bTRUNCATE\\s+TABLE\\b|\\bDDL\\b' +
  '|\\b(?:UPDATE|DELETE)\\b[\\s\\S]{0,80}\\bWHERE\\b' +                          // 大写 SQL（不加 i 标志，散文小写不命中）
  '|\\bSELECT\\b[\\s\\S]{0,120}\\b(?:SUM|COUNT|AVG)\\s*\\(' +                    // 聚合须 SELECT 上下文（不命中 items.count()）
  '|\\b(?:flyway|liquibase)\\b|\\bMQTT\\s+(?:topic|payload|broker|消息|报文)')   // MQTT 限定（不命中裸 MQTT client）
// 强财务 CJK（高精度子集；口语词 报告/时区/周期/时间窗/数据口径 移出正则、仅留 human-gate.md 供人判，防口语误触发）
const GATE_CJK = /金额|结算|计费|对账|收益|汇总|统计|报表|迁移脚本|批量(?:更新|删除)/
// 领域标识符（无歧义财务词）：①词边界 ②大写驼峰 ③词首接大写——不命中 rebalance/imbalance。
// balance 因双义（余额 vs 电芯/负载均衡）单独走 GATE_BALANCE 精确限定，不放这里（否则储能/BMS 域 cellBalance/loadBalancer 高频误 gate）。
const GATE_IDENT = /\b(?:payment|settlement|invoice|ledger|openapi)\b|(?:Payment|Settlement|Invoice|Ledger|OpenAPI)|\b(?:payment|settlement|invoice|ledger|openapi)(?=[A-Z])/
// 财务 balance 精确白名单：限定前缀(account/wallet/…)或后缀(sheet/due/…)或中文余额/结余——命中 accountBalance/balanceSheet 但放过 cellBalance/loadBalancer/rebalance
const GATE_BALANCE = /\b(?:account|wallet|user|customer|closing|opening|available|ledger|trial|outstanding)[-_ ]?balance\b|\bbalance[-_ ]?(?:sheet|due|amount|owed)\b|余额|结余/i
// DTO/VO：全词 或 小写字母后紧接大写 acronym（UserDTO/OrderVO）——不命中 VOLTAGE/SERVO/INVOKE 等大写词内子串（大小写敏感）
const GATE_ACRONYM = /\b(?:DTO|VO)\b|(?<=[a-z])(?:DTO|VO)\b/
// 契约类只判路径（杀 arch 视角「契约/SOLID contract」术语 FP）
const GATE_CONTRACT_PATH = /(^|[\/._-])contracts?(?=[\/._-]|$)|(^|[\/._-])契约(?=[\/._-]|$)|\.proto$|openapi|swagger/i   // contract 锚到路径/文件名分隔符边界（Rev2-M2 放过 ContractService.java；codex-final-M1 仍命中 contract.yaml/user-contract.json/contracts 目录/契约/proto/openapi/swagger）
// 敏感路径：迁移/schema/.sql + 部署脚本(docker/CI) + 生产配置(application.yml/secrets/cron)
const GATE_PATH = /(^|\/)(migrations?|schema|ddl)(\/|$)|\.sql$|flyway|liquibase|docker-?compose|dockerfile|\.github\/workflows|jenkinsfile|(^|\/)application(?:-[\w]+)?\.ya?ml$|(^|\/)secrets?(\.|\/|$)|(^|\/)cron/i
const isGated = f => {
  const text = `${f.title || ''} ${f.detail || ''} ${f.origFile ?? f.file ?? ''}`   // origFile 保原始大小写：camel/acronym gate 不被调用方 normPath 小写化绕过（codex H1）
  const path = normPath(f.file || '')   // 归一后再判路径 gate（对齐 sh 的 norm(f.file)）：反斜杠路径也能命中 GATE_PATH，不依赖调用方预归一
  return GATE_STRONG.test(text) || GATE_CJK.test(text) || GATE_IDENT.test(text) || GATE_BALANCE.test(text) || GATE_ACRONYM.test(text)
      || GATE_CONTRACT_PATH.test(path) || GATE_PATH.test(path)
}

// ---- JSON Schema ------------------------------------------------------------
const FINDINGS_SCHEMA = {
  type: 'object', required: ['reviewedFiles', 'findings'],
  properties: {
    reviewedFiles: { type: 'array', items: { type: 'string' }, description: '你实际 git diff/读过的文件（证明真审过，空=没审）' },
    findings: {
      type: 'array', maxItems: 12,
      items: {
        type: 'object', required: ['title', 'file', 'severity', 'detail'],
        properties: {
          title:    { type: 'string' },
          file:     { type: 'string', description: '相对仓库根的文件路径' },
          line:     { type: 'integer' },
          severity: { type: 'string', enum: ['H', 'M', 'L'] },
          detail:   { type: 'string', description: '为什么是问题 + 怎么修' },
        },
      },
    },
  },
}

const FIX_SCHEMA = {
  type: 'object', required: ['file', 'changed', 'summary'],
  properties: {
    file:      { type: 'string', description: '必须等于分配给你的目标文件' },
    changed:   { type: 'boolean' },
    summary:   { type: 'string' },
    buildPass: { type: 'boolean', description: '仅参考，权威验证在 Verify 步' },
    notes:     { type: 'string' },
  },
}

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['diffFiles', 'diffLines', 'changedStat', 'untracked', 'testGreen', 'testPass', 'testTotal', 'testStat', 'evidence'],
  properties: {
    diffFiles:    { type: 'integer', description: '已跟踪改动文件数，须等于 changedStat 长度' },
    diffLines:    { type: 'integer' },
    changedStat:  {
      type: 'array',
      items: { type: 'object', required: ['path', 'added', 'deleted'],
               properties: { path: { type: 'string' }, added: { type: 'integer' }, deleted: { type: 'integer' },
                             sha: { type: 'string', description: 'git hash-object 内容哈希；同增删行数的原地改写也能测出（比 ±行数指纹强）' } } },
      description: 'git diff --numstat 逐字输出：每个已跟踪改动文件的 +增/-删 + git hash-object 内容哈希（不要四舍五入/汇总）',
    },
    untracked:    { type: 'array', items: { type: 'string' }, description: 'git status --porcelain 中 ?? 的未跟踪新增文件路径（numstat 不含，单列以免漏门禁）' },
    untrackedStat:{ type: 'array', description: '（可选）每个未跟踪文件 {path, sha=git hash-object}，用于测出对既有未跟踪文件的原地改写', items: { type: 'object', required: ['path'], properties: { path: { type: 'string' }, sha: { type: 'string' } } } },
    testGreen:    { type: 'boolean' },
    testPass:     { type: 'integer', description: '通过用例数；无测试/仅 build 固定 -1' },
    testTotal:    { type: 'integer', description: '总用例数 pass+fail+error；无测试/仅 build 固定 -1' },
    testStat:     { type: 'string',  description: '形如 55/0/0；无测试/仅 build 固定 N/A（不可空）' },
    evidence:     { type: 'string',  description: 'git status/numstat 原文 + 必含独占一行 TEST_STAT: <testStat>' },
  },
}

// ---- 工具函数 ---------------------------------------------------------------
const SEV_RANK = { H: 3, M: 2, L: 1 }
const normPath = p => {
  let s = String(p || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim()
  return caseSensitivePaths ? s : s.toLowerCase()   // 大小写不敏感 FS 防 Foo.ts/foo.ts 误判两文件
}
// H3 修复：agent 按 prompt 回报 ${repo}/${g.file}（带前缀），归属校验需剥回相对仓库根再比，
// 否则 repo≠'.' 时每个合规 fix 都判 misowned → 永不收敛（静默锁死）。兼容 agent 报绝对或相对两种。
const repoNorm = normPath(repo).replace(/\/+$/, '')   // 去尾斜杠，覆盖 'proj/' / './proj/' / 双斜杠等形态
const relToRepo = p => {
  let s = normPath(p)
  if (repoNorm && repoNorm !== '.' && (s === repoNorm || s.startsWith(repoNorm + '/'))) {
    s = s.slice(repoNorm.length).replace(/^\/+/, '')
  }
  return s
}

function dedup(findings) {
  const m = new Map()
  for (const f of findings) {
    const k = `${f.file}::${(f.title || '').slice(0, 30).toLowerCase()}::${f.line ?? ''}`
    const ex = m.get(k)
    if (!ex) { m.set(k, { ...f }); continue }
    if ((SEV_RANK[f.severity] || 0) > (SEV_RANK[ex.severity] || 0)) ex.severity = f.severity
    if (f.detail && !(ex.detail || '').includes(f.detail)) ex.detail = `${ex.detail || ''} | ${f.detail}`
  }
  return [...m.values()]
}

function groupByFile(findings) {
  const m = new Map()
  for (const f of findings) {
    if (!m.has(f.file)) m.set(f.file, [])
    m.get(f.file).push(f)
  }
  return [...m.entries()].map(([file, items]) => ({ file, items }))
}

// 交叉校验：哨兵整行 + 三元组互校 + changedStat 数量须**精确**等于 diffFiles（门禁靠它完整性，不容缺漏）
function evidenceConsistent(v) {
  if (!v) return false
  const ev = String(v.evidence || '')
  const stat = String(v.testStat || '')
  if (!stat) return false
  if (expectTests && stat === 'N/A') return false   // 配了 testCmd 却报 N/A = 跳测试蒙混
  const m = ev.match(/^[ \t]*TEST_STAT:[ \t]*(N\/A|\d+\/\d+\/\d+)[ \t]*$/m)
  if (!m || m[1] !== stat) return false
  if (stat !== 'N/A') {
    const [p, f, e] = stat.split('/').map(Number)
    if ([p, f, e].some(n => !Number.isFinite(n) || n < 0)) return false
    // L 修复：stat≠N/A 时强制 testPass/testTotal 精确匹配（原 >=0 门控使 -1 时整体跳过 → stat 与字段解耦）
    if (v.testPass !== p) return false
    if (v.testTotal !== p + f + e) return false
    if (v.testGreen && (f > 0 || e > 0)) return false
  }
  if (Array.isArray(v.changedStat) && typeof v.diffFiles === 'number' && v.changedStat.length !== v.diffFiles) return false
  return true
}

// 回退检测（纯函数,便于单测）：9 条 OR,任一为真=本轮相对基线/上一可信轮回退（见 5b/F2）。逻辑逐字来自原内联表达式。
function computeRegressed({ baselineGreen, testGreen, baselinePass, testPass, baselineTotal, testTotal, lastTrustedPass, lastTrustedTotal, baselineFE, curFE, lastTrustedFE, lastTrustedGreen }) {
  return (baselineGreen && !testGreen) ||
         (baselinePass >= 0 && testPass >= 0 && testPass < baselinePass) ||
         (baselineTotal >= 0 && testTotal >= 0 && testTotal < baselineTotal) ||
         (lastTrustedPass >= 0 && testPass >= 0 && testPass < lastTrustedPass) ||   // 轮间回退（高于基线也抓）
         (lastTrustedTotal >= 0 && testTotal >= 0 && testTotal < lastTrustedTotal) ||   // 删测试回退（total 较可信轮下降）
         (baselineFE >= 0 && curFE >= 0 && curFE > baselineFE) ||        // F2：fail+error 较基线增加
         (lastTrustedFE >= 0 && curFE >= 0 && curFE > lastTrustedFE) ||  // F2：FE 较可信轮增加
         (lastTrustedGreen && !testGreen) ||                              // F2：可信绿→红
         (!testGreen && testPass < 0)                                     // 红且计数不可解析→保守判回退,堵假收敛
}

// 有效视角（quorum 反伪造）：reviewedFiles 非空 且 与本轮改动集有交集，才算真审过（防各报无关文件+空 findings 凑 quorum）
function validReviews(reviews, changedSet) {
  const hit = rf => (Array.isArray(rf) ? rf : []).some(x => changedSet.has(relToRepo(x)))   // relToRepo 剥 repo 前缀（codex H2）：repo≠'.' 时带前缀 reviewedFiles 也能匹配改动集
  return reviews.filter(r => r && Array.isArray(r.reviewedFiles) && r.reviewedFiles.length > 0 && hit(r.reviewedFiles))
}
// COVGAP：每个已跟踪改动文件须被**每个**有效视角审到；返回缺审文件（防各扫一部分的假全覆盖）
function computeUncovered(trackedChangedSet, okReviews) {
  return [...trackedChangedSet].filter(cf => okReviews.some(r => !(r.reviewedFiles || []).map(relToRepo).includes(cf)))   // codex H2：reviewedFiles 剥前缀再比
}
// 指纹触动集：遍历 prev∪cur 全路径，指纹变化（含新增/消失/同增删行数原地改写）即本轮触动
function computeTouched(prevStat, curStat) {
  const allPaths = new Set([...prevStat.keys(), ...curStat.keys()])
  return [...allPaths].filter(p => !fpEqual(prevStat.get(p), curStat.get(p)))
}
// 越界：触动了但不在当轮分配集 → 越权写（本轮不计收敛且不滚动基准 → 永远 re-flag）
function computeOutside(touched, assigned) {
  return touched.filter(p => !assigned.has(p))
}
// 证据可信：交叉校验过 且 无归属不符 且 非「自报已改却 diff=0」
function computeTrusted({ evidenceOk, misowned, actuallyChanged, diffFiles }) {
  return !!evidenceOk && misowned === 0 && !(actuallyChanged > 0 && diffFiles === 0)
}
// 可信基准滚动（ratchet）：仅未回退轮抬升 lastTrusted*；回退轮原样返回（防真恢复被误判回退→假 STOP）
function nextTrusted(prev, cur, regressed) {
  if (regressed) return { ...prev }
  return {
    lastTrustedPass: cur.testPass >= 0 ? Math.max(prev.lastTrustedPass, cur.testPass) : prev.lastTrustedPass,
    lastTrustedTotal: cur.testTotal >= 0 ? Math.max(prev.lastTrustedTotal, cur.testTotal) : prev.lastTrustedTotal,
    lastTrustedGreen: cur.testGreen,
    lastTrustedFE: cur.curFE >= 0 ? (prev.lastTrustedFE < 0 ? cur.curFE : Math.min(prev.lastTrustedFE, cur.curFE)) : prev.lastTrustedFE,
  }
}

async function runVerify(label) {
  return await safeAgent(
    `仓库：${repo}。只读验证，不要改任何代码，只观测并如实报告。\n` +
    `1. 先跑：cd "${repo}" && git status --porcelain && git diff --numstat\n` +
    `   —— changedStat=每个**已跟踪**改动文件{path,added,deleted,sha}（git diff --numstat 逐字、勿汇总；sha=对该文件跑 \`git hash-object -- <path>\` 的内容哈希，用于测出同增删行数的原地改写）；diffFiles=其文件数（须等于 changedStat 长度）、diffLines=总行数；untracked=status 中 ?? 的**未跟踪新增**文件路径列表（diff 不含，必须单列，否则会漏门禁）。\n` +
    `另给 untrackedStat=[{path, sha}]（sha=对每个 untracked 文件跑 \`git hash-object -- <path>\`），用于测出对**既有**未跟踪文件的原地改写（可选，尽力而为）。\n` +
    (testCmd ? `2. 再跑：cd "${repo}" && ${testCmd}   —— testStat=pass/fail/error、testPass、testTotal、testGreen。配了测试命令**必须**给真实数字，不准 N/A。\n`
             : (buildCmd ? `2. 再跑：cd "${repo}" && ${buildCmd}   —— 编译过则 testGreen=true、testPass=-1、testTotal=-1、testStat=N/A。\n`
                         : `2. 无测试/编译命令：testGreen=true、testPass=-1、testTotal=-1、testStat=N/A，evidence 注明「仅 diff 验证」。\n`)) +
    `必须严格按 1→2 顺序。evidence **必须含独占一行**：\nTEST_STAT: <pass>/<fail>/<error>（无测试则 TEST_STAT: N/A），与 testStat 字段逐字一致（锚定正则精确校验），并附 git status/numstat 原文摘要。`,
    { label, phase: 'Verify', schema: VERIFY_SCHEMA }
  )
}

const fixThunk = (g, otherFiles, round) => () => safeAgent(
  `## 唯一目标文件\n${repo}/${g.file}\n` +
  `**只能**改这一个文件。**禁止**碰以下及任何其它文件：${otherFiles.filter(x => x !== g.file).join(', ') || '（无其它分配）'}；` +
  `也禁止碰任何 DDL/迁移/.sql/契约/金额相关文件；铁律：同文件不双写。\n\n` +
  `## 要修的问题\n` + g.items.map(it => `- [${it.severity}]${it.line ? ` L${it.line}` : ''} ${it.title}：${it.detail}`).join('\n') +
  (buildCmd && serialFix ? `\n\n## 自检（参考用）\ncd "${repo}" && ${buildCmd}` : '') +
  `\n\n## 报告\nfile=本文件路径（须等于上面的目标文件）、changed=是否真改、关键点。不要废话。`,
  { label: `fix:${g.file}:r${round}`, phase: 'Fix', schema: FIX_SCHEMA }
)

// H 修复（sha 对称比对）：statMap 存 {sha,ln} 对象。fpEqual 仅当**两侧都有 sha** 时比 sha，否则回落 ±行数比。
// 防 agent 逐文件漏报 sha 导致 sha:abc↔5/3 格式跳变 → 幽灵越界 → 破坏「永不假收敛」/误触发 human-gate。
// 代价：sha 检测是 best-effort（需两轮都报 sha 才生效），漏报轮退化为行数比（不误报，但该轮不测同计数改写）。
const fpOf = s => ({ sha: (s && s.sha) ? String(s.sha) : null, ln: s ? `${s.added}/${s.deleted}` : null })
const fpEqual = (a, b) => {
  if (!a && !b) return true
  if (!a || !b) return false            // 一侧缺失（新增/消失）→ 触动
  if (a.sha && b.sha) return a.sha === b.sha
  return a.ln === b.ln                  // 任一侧无 sha → 回落行数比（对称，不跨格式跳变）
}
const statMap = stat => new Map((Array.isArray(stat) ? stat : []).map(s => [normPath(s.path), fpOf(s)]))
const UNTRACKED_FP = { sha: null, ln: 'U' }   // 未跟踪文件哨兵指纹
// 未跟踪文件指纹：优先用 agent 报的 git hash-object（能测出对既有未跟踪文件的原地改写，codex M1），无则回落哨兵 ln:'U'（不误报、退化为旧行为）。
const untrackedShaMap = arr => new Map((Array.isArray(arr) ? arr : []).map(u => [normPath(u && u.path), (u && u.sha) ? String(u.sha) : null]))
const untrackedFp = (m, np) => ({ sha: (m.get(np) ?? null), ln: 'U' })

// ---- 主循环 -----------------------------------------------------------------
log(`autoresearch-loop 启动：goal=${goal} | metric=${metric} | maxRounds=${maxRounds} | minClean=${minClean} | 视角×${PERSPECTIVES.length}${serialFix ? ' | serialFix' : ''}`)

const firstEstimate = tokenFloor * (PERSPECTIVES.length + 2)
if (budget.total != null && budget.remaining() < firstEstimate) {
  log(`STOP：启动前 token 余量 ${Math.round(budget.remaining())} < 首轮估算 ${firstEstimate}`)
  return { finalVerdict: 'STOP', converged: false, rounds: 0, stopReason: 'token 启动前已不足', goal, metric, history: [] }
}

// 基线（强制）：失败/证据不一致 → STOP
phase('Baseline')
const baselinePaths = new Set()
let baselineGreen = true, baselinePass = -1, baselineTotal = -1, baselineFE = -1
let prevStat = new Map()
{
  const b = await runVerify('baseline')
  if (!b || !evidenceConsistent(b)) {
    const why = '基线验证返回 null 或证据交叉校验失败，拒绝在不可信基线上迭代'
    log(`STOP：${why}`)
    return { finalVerdict: 'STOP', converged: false, rounds: 0, stopReason: why, goal, metric, history: [] }
  }
  baselineGreen = !!b.testGreen
  baselinePass = typeof b.testPass === 'number' ? b.testPass : -1
  baselineTotal = typeof b.testTotal === 'number' ? b.testTotal : -1
  baselineFE = (baselineTotal >= 0 && baselinePass >= 0) ? baselineTotal - baselinePass : -1   // fail+error 基线（F2 对齐 sh：FE 增加也算回退）
  for (const s of (b.changedStat || [])) baselinePaths.add(normPath(s.path))
  prevStat = statMap(b.changedStat)
  const bUntSha = untrackedShaMap(b.untrackedStat)
  for (const u of (b.untracked || [])) { const np = normPath(u); baselinePaths.add(np); prevStat.set(np, untrackedFp(bUntSha, np)) }   // 未跟踪文件：纳入 baselinePaths + 指纹基准（有 sha 用 sha 测原地改写 codex M1，无则哨兵）
  log(`基线：testGreen=${baselineGreen} testPass=${baselinePass} testTotal=${baselineTotal} | 已有改动 ${baselinePaths.size} 文件`)

  // 空工作树 → 无可审对象（本设计 reviewer 看 git diff），任何 scope 下都返回 NOOP，
  // 不空跑出假 CONVERGED（reviewedFiles 校验在 baseline 为空时会被旁路，故必须在此短路）
  if (baselinePaths.size === 0) {
    log('NOOP：工作树无未提交改动，无可审对象（本 loop 以 git diff 为审查面）')
    return { finalVerdict: 'NOOP', converged: false, rounds: 0, stopReason: '工作树无改动可审', goal, metric, history: [] }
  }
}

const history = []
const roundCosts = []
let round = 0, cleanRounds = 0, inconclusive = 0, consecutiveRegress = 0, consecutiveUntrusted = 0, covgap = 0, stopReason = null
const deferredL = []   // L 级问题延期清单：不阻塞收敛（收敛≠完美），但也不丢弃——收尾随 verdict 交用户决定
let gatedReport = []
let lastTrustedPass = baselinePass    // 轮间回退检测（除基线外，也比上一可信轮）
let lastTrustedTotal = baselineTotal  // 删测试回退检测（比 max(基线, 上一可信轮) total）
let lastTrustedGreen = baselineGreen  // 红→绿→红 回退检测（F2 对齐 sh）
let lastTrustedFE = baselineFE        // fail+error 回退检测（比 min(基线, 上一可信轮) FE，F2 对齐 sh）

const avgCost = () => roundCosts.length ? roundCosts.reduce((a, b) => a + b, 0) / roundCosts.length : 0

while (round < maxRounds && cleanRounds < minClean) {
  if (budget.total != null) {
    const need = round === 0 ? firstEstimate : Math.max(tokenFloor, avgCost())
    if (budget.remaining() < need) {
      stopReason = `token 预算不足（余 ${Math.round(budget.remaining())} < 需 ${Math.round(need)}）`
      log(`STOP（第 ${round + 1} 轮未启动）：${stopReason}`)
      break
    }
  }
  round++
  const roundStartSpent = budget.spent()

  // codex-H1 + Rev2-M1：基线人工卡点放在 review **之前**（对齐 sh 轮首、命中即停不白烧一轮 review）——
  // 改动集里**存在**敏感路径(迁移/.sql/schema/ddl/部署/生产配置 + contracts/ 目录/proto/openapi/swagger 工件)即 STOP，
  // 不依赖 reviewer 是否报 finding（预存在敏感改动未被任一视角标注也须交人工，对齐 human-gate 卡点2/3；与 sh gatebaseline 同逻辑）。
  const gatedPaths = [...new Set([...prevStat.keys(), ...baselinePaths])]
    .filter(p => GATE_PATH.test(normPath(p)) || GATE_CONTRACT_PATH.test(normPath(p)))
  if (gatedPaths.length > 0) {
    gatedReport = gatedPaths.map(p => ({ file: p, title: '改动集含敏感路径（迁移/DDL/部署/生产配置/契约工件），须交人工', severity: 'H' }))
    stopReason = `改动集含 ${gatedPaths.length} 个敏感路径文件（未经 reviewer 标注也须交人工），按 human-gate 停下`
    history.push({ round, verdict: 'STOP', gated: gatedPaths.length, regressed: false, evidence: stopReason + ' :: ' + gatedPaths.join(', ') })
    log(`r${round} verdict: STOP  evidence: ${stopReason}\n` + gatedPaths.map(p => `  - ${p}`).join('\n'))
    break
  }

  // === 1. 蜂群多视角审（并行 barrier）===
  phase('Review')
  const reviews = await parallel(PERSPECTIVES.map(p => () =>
    safeAgent(
      `你是${p.lens}视角的 reviewer。仓库：${repo}。审查范围：${scope}。\n` +
      (p.stance ? `**本视角审查法（必须先执行）**：${p.stance}\n` : '') +
      `**只读审查：禁止编辑/写入/删除任何文件**（只跑 git status/diff/read，不改代码；review 期的任何写入都会被 Verify 越界检测判为不可信）。\n` +
      `**先**跑 cd "${repo}" && git status --porcelain && git diff 看实际改动，reviewedFiles 列出你真检查过的文件。\n` +
      `再按 severity 排序给 finding，最多 12 条，不要凑数、不要 nitpick 充 H/M。\n` +
      `severity：H=必修(安全/数据正确性/崩溃)，M=应修(逻辑/资源/契约风险)，L=可选(风格/优化)。`,
      { label: `review:${p.key}:r${round}`, phase: 'Review', agentType: p.agentType, schema: FINDINGS_SCHEMA }
    )
  ))

  // === H1 修复：human-gate 预扫（fail-closed，最高优先，先于 quorum）===
  // 对**所有非 null review**（含无效视角）、**所有 severity**（不限 H/M）先扫卡点，命中即 STOP。
  // 防：视角掉线→!quorum→continue 使卡点 finding 被静默丢弃；或 reviewer 把金额/DDL 标 L 绕过。对齐 sh gatedscan。
  const rawAll = reviews.filter(Boolean).flatMap(r => (r.findings || []))
    .map(f => ({ ...f, origFile: f.file || '', file: relToRepo(f.file || '') }))   // origFile 保原始大小写供 text gate（codex H1）；file 走 relToRepo 剥 repo 前缀（codex H2）
    .filter(f => f.file && f.title)   // Claude-F1：对齐 sh gatedscan——gate 预扫不因 `..` 丢弃 gated finding（穿越路径也须 STOP，fail-closed）；`..` 过滤只在下方 fixable 侧（防越界修）
  const gatedAll = dedup(rawAll).filter(isGated)
  if (gatedAll.length > 0) {
    gatedReport = gatedAll.map(g => ({ file: g.file, title: g.title, severity: g.severity }))
    stopReason = `检测到 ${gatedAll.length} 条人工卡点 finding（DDL/契约/金额/敏感路径），按 human-gate 停下交人工`
    history.push({ round, verdict: 'STOP', gated: gatedAll.length, regressed: false,
                   evidence: stopReason + ' :: ' + gatedAll.map(g => `[${g.severity}] ${g.file}::${g.title}`).join(' / ') })
    log(`r${round} verdict: STOP  evidence: ${stopReason}\n` + gatedAll.map(g => `  - [${g.severity}] ${g.file} :: ${g.title}`).join('\n'))
    break
  }

  // === H2 修复：视角有效性 = reviewedFiles 归一后与已知改动集有交集（非仅非空）===
  // 防伪造：三视角各报一个无关文件名+空 findings 即满 quorum → 假收敛。对齐 sh validreview。
  const changedSetNow = new Set([...prevStat.keys(), ...baselinePaths])
  // COVGAP 专用：只含**已跟踪**改动文件（reviewer 跑 git diff 看不到 untracked，纳入会每轮误判缺审 → 误 STOP）
  const trackedChangedSet = new Set([...prevStat.entries()].filter(([, fp]) => fp && fp.ln !== 'U').map(([p]) => p))
  const okReviews = validReviews(reviews, changedSetNow)
  const responded = okReviews.length
  const quorum = responded === PERSPECTIVES.length
  const raw = okReviews.flatMap(r => r.findings || [])
    .map(f => ({ ...f, origFile: f.file, file: relToRepo(f.file) }))   // codex H1+H2：保原始大小写 + 剥 repo 前缀
    .filter(f => {
      if (!f.file || f.file.split('/').includes('..')) { log(`丢弃越界/空路径 finding：${f.title}`); return false }   // 按路径段判 `..`（对齐 sh classify:263），不误杀含 .. 的合法文件名如 my..config.ts
      return true
    })
  // 去重 + 改动集过滤（对齐 sh classify：cset 过滤作用于全集再派生 hm/H/M/fixable）。
  // diff 外非 gated 的 H/M 不留在 hm.length 里（否则 clean 恒假→空转到 maxRounds，而 sh 会正常收敛）；
  // gated 的 diff 外 finding 仍由上方**未过滤的 rawAll 预扫**兜住 STOP，不受此过滤影响。H/M 全量保留（不截断），L 仅计数。
  const deduped = dedup(raw)
  const inScope = deduped.filter(f => changedSetNow.has(f.file))   // changedSetNow=prevStat∪baselinePaths=当前 diff 快照，diff 内该修文件必在集内
  const hm = inScope.filter(f => f.severity === 'H' || f.severity === 'M')
  const fixable = hm.filter(f => !isGated(f))
  const lCount = inScope.filter(f => f.severity === 'L').length
  for (const f of inScope) if (f.severity === 'L') deferredL.push({ file: f.file, title: f.title, detail: (f.detail || '').slice(0, 200) })
  const H = hm.filter(f => f.severity === 'H').length
  const M = hm.filter(f => f.severity === 'M').length

  if (!quorum) {
    inconclusive++
    cleanRounds = 0
    history.push({ round, verdict: 'INCONCLUSIVE', responded, need: PERSPECTIVES.length, regressed: false,
                   evidence: `仅 ${responded}/${PERSPECTIVES.length} 视角有效响应（reviewedFiles∩改动集），不计入收敛` })
    log(`r${round} verdict: INCONCLUSIVE  evidence: 仅 ${responded}/${PERSPECTIVES.length} 视角有效`)
    if (inconclusive >= 2) { stopReason = '连续 2 轮审查视角不全/未真审，无法可靠判停'; log(`STOP：${stopReason}`); break }
    roundCosts.push(budget.spent() - roundStartSpent)
    continue
  }
  inconclusive = 0

  // === COVGAP 回填（对齐 sh uncovered）：每个改动文件须被**每个**视角审到 ===
  // 防「各视角各扫一部分、合起来看似全覆盖、实则某文件漏某 lens」的假收敛。连续 2 轮缺覆盖 → STOP 交人工缩 scope。
  const uncovered = computeUncovered(trackedChangedSet, okReviews)
  if (uncovered.length > 0) {
    covgap++
    cleanRounds = 0
    history.push({ round, verdict: 'INCONCLUSIVE', regressed: false,
                   evidence: `改动文件未被每个视角审到（缺审 ${uncovered.length}：${uncovered.slice(0, 5).join(', ')}${uncovered.length > 5 ? '…' : ''}）` })
    log(`r${round} verdict: INCONCLUSIVE  evidence: 覆盖不全，缺审 ${uncovered.length} 文件`)
    if (covgap >= 2) { stopReason = '连续 2 轮覆盖不全（部分改动文件无人审），交人工缩小 scope 或补视角'; log(`STOP：${stopReason}`); break }
    roundCosts.push(budget.spent() - roundStartSpent)
    continue
  }
  covgap = 0

  // === 2. 狼群修 ===
  let actuallyChanged = 0, plannedFiles = 0, misowned = 0
  const assignedThisRound = new Set()
  if (fixable.length) {
    const groups = groupByFile(fixable)
    const files = groups.map(g => g.file)
    plannedFiles = files.length
    files.forEach(f => assignedThisRound.add(f))

    if (budget.total != null) {
      const proj = (groups.length + 1) * tokenFloor
      if (budget.remaining() < proj) {
        stopReason = `预算不足以覆盖本轮 ${groups.length} 个修复+验证（需≈${proj}，余 ${Math.round(budget.remaining())}）`
        history.push({ round, verdict: 'STOP', H, M, regressed: false, evidence: stopReason })
        log(`r${round} verdict: STOP  evidence: ${stopReason}`); break
      }
    }

    phase('Fix')
    let fixes
    if (serialFix) {
      fixes = []
      for (const g of groups) fixes.push(await fixThunk(g, files, round)())
    } else {
      fixes = await parallel(groups.map(g => fixThunk(g, files, round)))
    }
    for (let i = 0; i < groups.length; i++) {
      const r = fixes[i]
      if (!r) continue
      if (r.changed) actuallyChanged++
      // 归属：按索引对齐 + 自报 file 必须在分配集内（双重，避免单靠保序）
      const rf = relToRepo(r.file)
      if (rf !== groups[i].file || !assignedThisRound.has(rf)) misowned++
    }
    if (misowned) log(`⚠️ ${misowned} 个 fix 自报文件与分配不符，本轮判不可信`)
  }

  // === 3. 验证 + 交叉校验 + 指纹越界检测 ===
  phase('Verify')
  const verify = await runVerify(`verify:r${round}`)
  if (!verify) {
    stopReason = 'verify agent 返回 null（skip/死亡），无法获取客观证据'
    history.push({ round, verdict: 'STOP', H, M, regressed: false, evidence: stopReason })
    log(`r${round} verdict: STOP  evidence: ${stopReason}`); break
  }
  const trusted = computeTrusted({ evidenceOk: evidenceConsistent(verify), misowned, actuallyChanged, diffFiles: verify.diffFiles })
  if (actuallyChanged > 0 && verify.diffFiles === 0) log(`⚠️ 实证不符：${actuallyChanged} 个 agent 自报已改，但 git diff=0，本轮判不可信`)

  const testGreen = !!verify.testGreen
  const testPass = typeof verify.testPass === 'number' ? verify.testPass : -1
  const testTotal = typeof verify.testTotal === 'number' ? verify.testTotal : -1
  const curFE = (testTotal >= 0 && testPass >= 0) ? testTotal - testPass : -1   // 本轮 fail+error 数
  const regressed = computeRegressed({ baselineGreen, testGreen, baselinePass, testPass, baselineTotal, testTotal, lastTrustedPass, lastTrustedTotal, baselineFE, curFE, lastTrustedFE, lastTrustedGreen })

  // 指纹越界检测：遍历 prev∪cur 全路径，指纹变化（含消失/新增）即「本轮触动」；触动且不在分配集 → 越界
  const curStat = statMap(verify.changedStat)
  const curUntSha = untrackedShaMap(verify.untrackedStat)
  for (const u of (Array.isArray(verify.untracked) ? verify.untracked : [])) {   // 未跟踪新增/既有文件并入（堵新建 .sql 绕 numstat + 测既有未跟踪原地改写 codex M1）
    const np = normPath(u)
    if (np && !curStat.has(np)) curStat.set(np, untrackedFp(curUntSha, np))
  }
  const touched = computeTouched(prevStat, curStat)
  const outside = computeOutside(touched, assignedThisRound)
  if (outside.length) log(`⚠️ 越界写：本轮改动超出分配 ${outside.join(', ')}，本轮不计收敛且不滚动基准（将持续 re-flag）`)
  const gatedWrites = touched.filter(p => isGated({ file: p, origFile: p, title: '', detail: '' }))   // codex M2：越权写复用完整 isGated（含 contract/proto/openapi/balance），不止 GATE_PATH
  if (gatedWrites.length) {
    gatedReport = gatedWrites.map(p => ({ file: p, title: '修复越权写入敏感文件', severity: 'H' }))
    stopReason = `修复改动触及敏感文件（DDL/迁移/.sql）：${gatedWrites.join(', ')}，按 human-gate 停下交人工`
    history.push({ round, verdict: 'STOP', H, M, regressed, evidence: stopReason })
    log(`r${round} verdict: STOP  evidence: ${stopReason}`); break
  }
  if (!trusted) log(`⚠️ 证据不可信（交叉校验失败/归属不符/改动未落盘），本轮不计入收敛`)

  // === 4. verdict 判停 ===
  phase('Judge')
  consecutiveRegress = regressed ? consecutiveRegress + 1 : 0
  consecutiveUntrusted = trusted ? 0 : consecutiveUntrusted + 1   // M8：连续不可信计数
  const clean = hm.length === 0 && !regressed && outside.length === 0 && trusted

  // 指纹基准：可信且无越界即滚动（含回退轮——越界 re-flag 只针对文件归属，与测试回退正交；对齐 sh 每轮 fresh pre.fp）
  if (trusted && outside.length === 0) {
    prevStat = curStat
    // 全部测试可信基准（pass/total/green/FE）仅在**未回退**轮更新（对齐 sh 633-638：trusted=最近一次没退步的状态）。
    // 否则回退轮若 pass 反升会 ratchet 抬高 lastTrustedPass，使后续真恢复被误判回退 → 假 STOP。
    const nt = nextTrusted({ lastTrustedPass, lastTrustedTotal, lastTrustedGreen, lastTrustedFE }, { testPass, testTotal, testGreen, curFE }, regressed)
    lastTrustedPass = nt.lastTrustedPass
    lastTrustedTotal = nt.lastTrustedTotal
    lastTrustedGreen = nt.lastTrustedGreen
    lastTrustedFE = nt.lastTrustedFE
  }

  let verdict
  if (clean) { cleanRounds++; verdict = 'CONVERGED' }
  else {
    cleanRounds = 0
    // M8：连续 2 轮证据不可信 → STOP，暴露 H3 类归属异常/verify 抖动，不白烧到 maxRounds
    if (consecutiveUntrusted >= 2) { verdict = 'STOP'; stopReason = '连续 2 轮证据不可信（归属异常/验证抖动/改动未落盘），停下排查' }
    else if (consecutiveRegress >= 2) { verdict = 'STOP'; stopReason = '连续 2 轮测试回退，暂停防无限震荡' }
    else verdict = 'HOLD'
  }

  const rec = {
    round, verdict, H, M, L: lCount,
    fixedFiles: actuallyChanged, plannedFiles, outside: outside.length, misowned, trusted,
    diffFiles: verify.diffFiles, diffLines: verify.diffLines,
    testGreen, testPass, testTotal, testStat: verify.testStat, regressed,
    evidence: `H=${H} M=${M} L=${lCount} | 越界=${outside.length} | diff ${verify.diffFiles}文件/${verify.diffLines}行 | ` +
              `test ${verify.testStat || 'N/A'}${regressed ? ' (回退!)' : ''}${trusted ? '' : ' (证据存疑)'}`,
  }
  history.push(rec)
  log(`r${round} verdict: ${verdict} (cleanRounds=${cleanRounds}/${minClean})  evidence: ${rec.evidence}`)

  if (verdict === 'STOP') { log(`STOP：${stopReason}`); break }
  roundCosts.push(budget.spent() - roundStartSpent)
}

// ---- 收尾报告 ---------------------------------------------------------------
const converged = cleanRounds >= minClean
if (!converged && !stopReason && round >= maxRounds) stopReason = `达轮数上限 ${maxRounds} 仍未收敛`

const finalVerdict = converged ? 'CONVERGED' : (stopReason ? 'STOP' : 'HOLD')
const deferred = dedup(deferredL)   // 去重后交付：L 级 TODO 清单（修不修由用户拍板，不自动烧轮数）
const gateNote = gatedReport.length > 0
  ? `；人工卡点 ${gatedReport.length} 条需人工处理：` + gatedReport.map(g => `${g.file}::${g.title}`).join(' / ')
  : ''
log(`=== autoresearch-loop 结束：${finalVerdict} | 共 ${round} 轮 | ${stopReason || (converged ? '已收敛' : '未收敛')}${deferred.length ? ` | L级延期 ${deferred.length} 条（见 deferred，修不修由用户定）` : ''}${gateNote} ===`)

return {
  finalVerdict, converged,
  rounds: round, cleanRounds, stopReason, deferred,
  baselineGreen, baselinePass, baselineTotal,
  gated: gatedReport,
  goal, metric, history,
}
