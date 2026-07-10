// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · CARTÕES DE ESTADO  v3.2         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  v3 — 5 cards, ícone por card, linguagem intuitiva (sem jargão L1/L2/L3 ║
// ║  nos títulos):                                                          ║
// ║    0. Aplicação            (identidade: nome, serviço, nº de VMs)       ║
// ║    1. Está no ar?          (acesso à página — cenário L1) + mini-24h    ║
// ║    2. Velocidade           (tempo de resposta + sparkline 6h — L2)      ║
// ║    3. Conteúdo da página   (texto esperado — mostra a string real)      ║
// ║    4. Problemas activos (externo) (contagem + idade do mais antigo)     ║
// ║                                                                          ║
// ║  v3.2 — card 4 mostra 2 contagens lado a lado, mesmo peso visual:       ║
// ║  "externo" (checks L1-L4 do host sintético) e "infra (VMs)" (triggers   ║
// ║  das VMs por trás, tag servico=). NUNCA somadas na mesma contagem —     ║
// ║  severidades diferentes (site fora do ar vs disco a 89%). Painel        ║
// ║  nativo de triggers (id 105) também passou a incluir ambos os escopos   ║
// ║  via variável ${hostRegex} (host sintético + VMs). Ver                  ║
// ║  documentacao/mapa-apps-vms.md §1.8/§1.9.                               ║
// ║                                                                          ║
// ║  VMs ligadas: host.get filtrado por tags servico=<mesmo valor do app>,  ║
// ║  excluindo o próprio host app-* — funciona para sistemas multi-VM       ║
// ║  (SACC, CONTIF, ebankit…) sem depender de nenhum ficheiro local.        ║
// ║                                                                          ║
// ║  Estado vem de trigger.get (Zabbix já avaliou); valores de item.get;    ║
// ║  sparkline de history.get. webitems:true obrigatório nos web items.     ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_L3KPI = {
  elementId: 'bpc-app-kpi',
  refreshMs: 60000,
  sparkWindowSecs: 21600, // 6h de histórico para a sparkline de velocidade
  sparkMaxPoints: 80,
  bucketWindowSecs: 86400, // 24h para a mini-barra do card "Está no ar?"
  bucketCount: 8,
}

// Ícones — SVG inline (sem dependência de fonte externa), 13x13, herdam a cor via stroke.
const L3KPI_ICONS = {
  app:      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/></svg>',
  pulse:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h4l2 6 4-14 2 8h6"/></svg>',
  speed:    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2"/><path d="M9 3h6"/></svg>',
  docCheck: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l2 2 4-4"/><rect x="3" y="4" width="18" height="16" rx="2"/></svg>',
  bell:     '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>',
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function l3kpiGetAppName() {
  return new URLSearchParams(window.location.search).get('var-app') || ''
}

function l3kpiMs(secStr) {
  const v = parseFloat(secStr)
  if (isNaN(v)) return null
  return v >= 1 ? (Math.round(v * 100) / 100) + ' s' : Math.round(v * 1000) + ' ms'
}

function l3kpiAgeLabel(oldestTs) {
  const days = Math.floor((Date.now() / 1000 - oldestTs) / 86400)
  if (days >= 1) return 'há ' + days + (days === 1 ? ' dia' : ' dias')
  const hours = Math.floor((Date.now() / 1000 - oldestTs) / 3600)
  if (hours >= 1) return 'há ' + hours + (hours === 1 ? ' hora' : ' horas')
  return 'há menos de 1 hora'
}

// Traduz a mensagem de erro técnica do L3 para linguagem simples
function l3kpiContentError(errMsg) {
  const m = /required pattern "(.+?)" was not found/.exec(errMsg || '')
  if (m) return 'texto "' + m[1] + '" não encontrado na página'
  return errMsg ? String(errMsg).slice(0, 70) : 'ver problemas activos'
}

// "5m" / "1h" / "30s" -> segundos
function l3kpiDelaySecs(delayStr) {
  const m = /^(\d+)([smh])$/.exec(String(delayStr || '').trim())
  if (!m) return 60
  const n = parseInt(m[1], 10)
  return m[2] === 'h' ? n * 3600 : m[2] === 'm' ? n * 60 : n
}

function l3kpiTagVal(tags, key) {
  const t = (tags || []).find(function (x) { return x.tag === key })
  return t ? t.value : ''
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3kpiFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'host', 'name', 'maintenance_status'],
    selectTags: ['tag', 'value'],
  })
  return hosts[0] || null
}

async function l3kpiFetchItems(rpc, hostid) {
  return rpc('item.get', {
    hostids: [hostid],
    webitems: true,
    search: { key_: 'web.test.' },
    output: ['itemid', 'key_', 'lastvalue', 'lastclock', 'delay'],
  })
}

async function l3kpiFetchTriggers(rpc, hostid) {
  return rpc('trigger.get', {
    hostids: [hostid],
    filter: { value: 1 },
    output: ['description', 'priority', 'lastchange'],
    monitored: true,
    only_true: true,
  })
}

async function l3kpiFetchSpark(rpc, itemid) {
  if (!itemid) return []
  const rows = await rpc('history.get', {
    itemids: [itemid],
    history: 0, // float
    time_from: Math.floor(Date.now() / 1000) - CFG_L3KPI.sparkWindowSecs,
    output: 'extend',
    sortfield: 'clock',
    sortorder: 'ASC',
  })
  const vals = rows.map(function (r) { return parseFloat(r.value) * 1000 })
  if (vals.length <= CFG_L3KPI.sparkMaxPoints) return vals
  const step = vals.length / CFG_L3KPI.sparkMaxPoints
  const out = []
  for (let i = 0; i < CFG_L3KPI.sparkMaxPoints; i++) out.push(vals[Math.floor(i * step)])
  return out
}

// Mini-histórico de 24h para o card "Está no ar?" — bucketiza o histórico do
// item web.test.fail[L1] em N janelas iguais: 'down' se alguma falha no
// bucket, 'ok' se só sucessos, 'nodata' se o bucket não tem amostras.
async function l3kpiFetchDayBuckets(rpc, itemid) {
  if (!itemid) return []
  const now = Math.floor(Date.now() / 1000)
  const from = now - CFG_L3KPI.bucketWindowSecs
  const rows = await rpc('history.get', {
    itemids: [itemid], history: 3, time_from: from, time_till: now,
    output: 'extend', sortfield: 'clock', sortorder: 'ASC',
  })
  const bucketSecs = CFG_L3KPI.bucketWindowSecs / CFG_L3KPI.bucketCount
  const buckets = []
  for (let i = 0; i < CFG_L3KPI.bucketCount; i++) {
    const bStart = from + i * bucketSecs, bEnd = bStart + bucketSecs
    const inBucket = rows.filter(function (r) { return r.clock >= bStart && r.clock < bEnd })
    if (!inBucket.length) { buckets.push('nodata'); continue }
    buckets.push(inBucket.some(function (r) { return r.value === '1' }) ? 'down' : 'ok')
  }
  return buckets
}

// VMs ligadas a este serviço (mesma tag servico=, excluindo o próprio host
// app-* que é o monitor sintético) + quantos problemas de infra (triggers)
// essas VMs têm activos agora — usado para avisar no card 4 que a tabela
// "VMs de hospedagem" tem algo, mesmo quando os checks externos (L1-L4)
// estão todos OK. São escopos diferentes de propósito (ver
// documentacao/mapa-apps-vms.md §1.8) — este count nunca entra na contagem
// do próprio card 4, só acciona o aviso cruzado.
async function l3kpiFetchVmInfo(rpc, servico, ownHost) {
  if (!servico) return { count: 0, problemCount: 0 }
  const hosts = await rpc('host.get', {
    output: ['hostid', 'host'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  const vms = hosts.filter(function (h) { return h.host !== ownHost && h.host.indexOf('app-') !== 0 })
  if (!vms.length) return { count: 0, problemCount: 0 }
  const trigs = await rpc('trigger.get', {
    hostids: vms.map(function (h) { return h.hostid }),
    filter: { value: 1 },
    output: ['triggerid'],
    monitored: true,
    only_true: true,
  })
  return { count: vms.length, problemCount: trigs.length }
}

async function l3kpiFetchStringCheck(rpc, hostid) {
  const macros = await rpc('usermacro.get', { hostids: [hostid], output: ['macro', 'value'] })
  const m = macros.find(function (x) { return x.macro === '{$STRING.CHECK}' })
  return m ? m.value : ''
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3kpiTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const valueColor = state === 'mute' ? 'var(--bpc-mute)' : accent
  const sub = opts.sub
    ? '<div style="font-size:1.15rem;color:var(--bpc-mute);line-height:1.35">' + opts.sub + '</div>'
    : ''
  const extra = opts.extra || ''
  const icon = opts.icon
    ? '<span style="display:inline-flex;color:' + accent + ';margin-right:6px;vertical-align:-1px">' + opts.icon + '</span>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px 20px">'
    + '<span class="bpc-label" style="font-size:1.2rem;letter-spacing:.02em;text-transform:none;font-weight:700;color:#CDD9E5">' + icon + opts.label + '</span>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:10px">'
    +   '<span style="font-size:2.9rem;font-weight:800;line-height:1.05;color:' + valueColor + '">' + opts.value + '</span>'
    +   (opts.valueSuffix ? '<span style="font-size:1.2rem;color:var(--bpc-mute)">' + opts.valueSuffix + '</span>' : '')
    + '</div>'
    + extra
    + sub
    + '</div>'
}

// Card 4 "Problemas activos" — 2 contagens lado a lado, mesmo peso visual:
// externo (checks L1-L4 do host sintético) e infra (triggers das VMs por
// trás, mesma tag servico=). Nunca somadas na mesma contagem — severidades
// diferentes (site fora do ar vs disco a 89%). Ver documentacao/mapa-apps-vms.md §1.8.
function l3kpiDualStat(label, value, color) {
  return '<div style="flex:1;text-align:center;min-width:0">'
    + '<div style="font-size:2.9rem;font-weight:800;line-height:1.05;color:' + color + '">' + value + '</div>'
    + '<div style="font-size:1.0rem;color:var(--bpc-mute);margin-top:4px;white-space:nowrap">' + label + '</div>'
    + '</div>'
}

function l3kpiProblemsTile(opts) {
  const accent = window.BPC.state.color(opts.cardState)
  const cardSt = opts.cardState === 'crit' || opts.cardState === 'down' ? 'down' : opts.cardState
  const icon = '<span style="display:inline-flex;color:' + accent + ';margin-right:6px;vertical-align:-1px">' + L3KPI_ICONS.bell + '</span>'
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px 14px">'
    + '<span class="bpc-label" style="font-size:1.2rem;letter-spacing:.02em;text-transform:none;font-weight:700;color:#CDD9E5">' + icon + 'Problemas activos</span>'
    + '<div style="display:flex;align-items:stretch">'
    +   l3kpiDualStat('externo', opts.extValue, opts.extColor)
    +   '<div style="width:1px;background:rgba(255,255,255,.12);margin:1px 10px"></div>'
    +   l3kpiDualStat('infra (VMs)', opts.infraValue, opts.infraColor)
    + '</div>'
    + '<div style="font-size:1.0rem;color:var(--bpc-mute);text-align:center;line-height:1.3">' + opts.sub + '</div>'
    + '</div>'
}

// Mini-barra de 8 segmentos (24h) — usada no card "Está no ar?"
function l3kpiMiniBar(buckets) {
  if (!buckets.length) return ''
  const colorOf = function (b) {
    if (b === 'down') return window.BPC.state.color('down')
    if (b === 'ok') return window.BPC.state.color('ok')
    return 'rgba(255,255,255,.12)'
  }
  const bars = buckets.map(function (b) {
    return '<div style="flex:1;height:10px;border-radius:1px;background:' + colorOf(b) + '"></div>'
  }).join('')
  return '<div style="display:flex;gap:1.5px;margin-top:2px">' + bars + '</div>'
    + '<div style="font-size:.95rem;color:#5f5e5a;margin-top:2px">últimas 24h</div>'
}

function l3kpiRender(el, data) {
  const items = {}
  data.items.forEach(function (i) { items[i.key_] = i })
  const trigs = data.trigs
  const host = data.host
  const inMaintenance = host && host.maintenance_status === '1'
  const esc = window.BPC_SHARED.esc

  function lastVal(key) { const it = items[key]; return it ? it.lastvalue : null }
  function itemOf(key) { return items[key] }
  function hasData(key) { const it = items[key]; return it && parseInt(it.lastclock, 10) > 0 }
  // O item so actualiza quando o cenario tem sucesso — se o L1 estiver a
  // falhar ha muito tempo, o ultimo valor "bom" fica congelado (visto em
  // producao: 8h+ de idade a parecer dado ao vivo). Considerar obsoleto
  // quando a idade excede 3x o proprio delay do item.
  function isFresh(key) {
    const it = items[key]
    if (!it || !(parseInt(it.lastclock, 10) > 0)) return false
    const ageSecs = (Date.now() / 1000) - parseInt(it.lastclock, 10)
    return ageSecs <= l3kpiDelaySecs(it.delay) * 3
  }
  function problemOf(levelTag) {
    return trigs.find(function (t) { return t.description.indexOf(levelTag) !== -1 })
  }

  // ── 0. Aplicação (identidade) ──
  const servico = l3kpiTagVal(host.tags, 'servico')
  const nome = esc(String(host.name || '').replace(' - Monitor da URL', ''))
  const vmCount = data.vmInfo.count
  const vmSub = vmCount === 0 ? 'sem VM interna (externo/parceiro)'
    : vmCount === 1 ? '1 VM ligada' : vmCount + ' VMs ligadas'
  const card0 = l3kpiTile({
    label: 'Aplicação', icon: L3KPI_ICONS.app,
    value: '<span style="font-size:1.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;max-width:280px">' + nome + '</span>',
    state: 'ok',
    sub: (servico ? 'Serviço: ' + esc(servico) : '') + (servico && vmSub ? ' · ' : '') + vmSub,
  })

  // ── 1. Está no ar? (cenário L1-Disponibilidade) ──
  const l1Fail = problemOf('[L1]')
  const l1Time = l3kpiMs(lastVal('web.test.time[L1-Disponibilidade,Verificar disponibilidade,resp]'))
  const miniBar = l3kpiMiniBar(data.buckets)
  let card1
  if (inMaintenance) {
    card1 = l3kpiTile({
      label: 'Está no ar?', icon: L3KPI_ICONS.pulse, value: 'SEM ACESSO', state: 'mute',
      sub: 'monitorização em manutenção — sem acesso de saída a partir do DC',
    })
  } else if (!hasData('web.test.fail[L1-Disponibilidade]')) {
    card1 = l3kpiTile({ label: 'Está no ar?', icon: L3KPI_ICONS.pulse, value: 'SEM DADOS', state: 'mute', sub: 'verificação não configurada' })
  } else if (l1Fail) {
    const err = lastVal('web.test.error[L1-Disponibilidade]')
    card1 = l3kpiTile({
      label: 'Está no ar?', icon: L3KPI_ICONS.pulse, value: 'NÃO', state: 'down', extra: miniBar,
      sub: err ? esc(String(err).slice(0, 70)) : 'a página não responde',
    })
  } else {
    card1 = l3kpiTile({
      label: 'Está no ar?', icon: L3KPI_ICONS.pulse, value: 'SIM', state: 'ok', extra: miniBar,
      sub: 'página acessível' + (l1Time ? ' · resposta em ' + l1Time : '') + ' · verificada a cada minuto',
    })
  }

  // ── 2. Velocidade (cenário L2-Performance) ──
  const l2Slow = problemOf('[L2]')
  const l2Time = l3kpiMs(lastVal('web.test.time[L2-Performance,Medir tempo de resposta,resp]'))
  const sparkColor = l2Slow ? window.BPC.state.color('warn') : window.BPC.state.color('ok')
  const spark = data.spark.length > 1
    ? '<div style="margin-top:2px">' + window.BPC_CHARTS.sparkline(data.spark, sparkColor) + '</div>'
    : ''
  let card2
  if (inMaintenance) {
    card2 = l3kpiTile({ label: 'Velocidade', icon: L3KPI_ICONS.speed, value: 'SEM ACESSO', state: 'mute', sub: 'sem verificação a partir do DC' })
  } else if (!hasData('web.test.fail[L2-Performance]')) {
    card2 = l3kpiTile({ label: 'Velocidade', icon: L3KPI_ICONS.speed, value: 'SEM DADOS', state: 'mute', sub: 'verificação não configurada' })
  } else if (l1Fail && !hasData('web.test.time[L2-Performance,Medir tempo de resposta,resp]')) {
    card2 = l3kpiTile({
      label: 'Velocidade', icon: L3KPI_ICONS.speed, value: 'SEM DADOS', state: 'mute',
      sub: 'app fora do ar — ainda sem nenhuma resposta bem sucedida registada',
    })
  } else if (l1Fail && !isFresh('web.test.time[L2-Performance,Medir tempo de resposta,resp]')) {
    card2 = l3kpiTile({
      label: 'Velocidade', icon: L3KPI_ICONS.speed, value: 'SEM DADOS RECENTES', state: 'mute',
      sub: 'app fora do ar — último tempo de resposta é de antes da falha (' + esc(String(l2Time || '—')) + ')',
    })
  } else {
    card2 = l3kpiTile({
      label: 'Velocidade', icon: L3KPI_ICONS.speed,
      value: l2Time || '—',
      valueSuffix: l2Slow ? 'MAIS LENTA QUE O NORMAL' : 'normal',
      state: l2Slow ? 'warn' : 'ok',
      extra: spark,
      sub: 'tempo de resposta · últimas 6 horas',
    })
  }

  // ── 3. Conteúdo da página (cenário L3-Conteudo) ──
  const l3Fail = problemOf('[L3]')
  const expectedString = data.stringCheck
  let card3
  if (inMaintenance) {
    card3 = l3kpiTile({ label: 'Conteúdo da página', icon: L3KPI_ICONS.docCheck, value: 'SEM ACESSO', state: 'mute', sub: 'sem verificação a partir do DC' })
  } else if (!hasData('web.test.fail[L3-Conteudo]')) {
    card3 = l3kpiTile({ label: 'Conteúdo da página', icon: L3KPI_ICONS.docCheck, value: 'NÃO VERIFICADO', state: 'mute', sub: 'sem texto de controlo definido para esta app' })
  } else if (l1Fail && !isFresh('web.test.fail[L3-Conteudo]')) {
    card3 = l3kpiTile({
      label: 'Conteúdo da página', icon: L3KPI_ICONS.docCheck, value: 'SEM DADOS RECENTES', state: 'mute',
      sub: 'app fora do ar — a página não chegou a carregar para verificar o conteúdo',
    })
  } else if (l3Fail) {
    card3 = l3kpiTile({
      label: 'Conteúdo da página', icon: L3KPI_ICONS.docCheck, value: 'ERRADO', state: 'warn',
      sub: esc(l3kpiContentError(lastVal('web.test.error[L3-Conteudo]'))),
    })
  } else {
    card3 = l3kpiTile({
      label: 'Conteúdo da página', icon: L3KPI_ICONS.docCheck, value: 'CORRECTO', state: 'ok',
      sub: expectedString ? 'texto "' + esc(expectedString) + '" presente na página' : 'o texto esperado está presente na página',
    })
  }

  // ── 4. Problemas activos — 2 contagens paralelas, mesmo peso: externo
  // (checks L1-L4 do host sintético) e infra (triggers das VMs por trás,
  // tag servico=). Nunca somadas na mesma contagem — severidades diferentes
  // (site fora do ar vs disco a 89%). Ver documentacao/mapa-apps-vms.md §1.8.
  // Nota: trigger.value continua 1 mesmo com o host em manutenção (supressão
  // silencia notificações/painel nativo, não o valor do trigger) — por isso
  // "externo" trata a manutenção à parte, para não contradizer os cards 1-3;
  // "infra" (as VMs) não está em manutenção do app, por isso mantém-se vivo.
  const total = trigs.length
  const oldest = total > 0 ? Math.min.apply(null, trigs.map(function (t) { return parseInt(t.lastchange, 10) })) : null
  const vmProblems = data.vmInfo.problemCount
  const infraColor = vmProblems > 0 ? window.BPC.state.color('warn') : window.BPC.state.color('ok')
  let extValue, extColor, sub, cardState
  if (inMaintenance) {
    extValue = String(total)
    extColor = 'var(--bpc-mute)'
    cardState = vmProblems > 0 ? 'warn' : 'mute'
    sub = 'externo suprimido (manutenção)' + (vmProblems > 0
      ? ' · ' + vmProblems + (vmProblems === 1 ? ' alerta de infra ↓' : ' alertas de infra ↓')
      : '')
  } else {
    extValue = String(total)
    extColor = l1Fail ? window.BPC.state.color('down') : total > 0 ? window.BPC.state.color('warn') : window.BPC.state.color('ok')
    cardState = l1Fail ? 'down' : (total > 0 || vmProblems > 0) ? 'warn' : 'ok'
    if (total > 0) {
      sub = 'externo: o mais antigo começou ' + l3kpiAgeLabel(oldest)
    } else if (vmProblems > 0) {
      sub = 'nenhum externo · ' + vmProblems + (vmProblems === 1 ? ' alerta de infra ↓' : ' alertas de infra ↓')
    } else {
      sub = 'nenhum problema, externo ou infra'
    }
  }
  const card4 = l3kpiProblemsTile({
    extValue: extValue, extColor: extColor,
    infraValue: String(vmProblems), infraColor: infraColor,
    cardState: cardState, sub: sub,
  })

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + card0 + card1 + card2 + card3 + card4 + '</div>'
}

function l3kpiRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Estado da app: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}

function l3kpiRenderNoApp(el) {
  el.innerHTML = '<div class="bpc bpc-card" style="--card-accent:var(--bpc-mute)">'
    + '<div class="bpc-error-msg">Selecciona uma aplicação no menu acima.</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function l3kpiLoad(rpc) {
  const el = document.getElementById(CFG_L3KPI.elementId)
  if (!el) return

  const appName = l3kpiGetAppName()
  if (!appName) { l3kpiRenderNoApp(el); return }

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  l3kpiFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3kpiRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    const servico = l3kpiTagVal(host.tags, 'servico')
    return Promise.all([
      l3kpiFetchItems(rpc, host.hostid),
      l3kpiFetchTriggers(rpc, host.hostid),
      l3kpiFetchVmInfo(rpc, servico, host.host),
      l3kpiFetchStringCheck(rpc, host.hostid),
    ]).then(function (r) {
      const items = r[0], trigs = r[1], vmInfo = r[2], stringCheck = r[3]
      const l2Item = items.find(function (i) {
        return i.key_ === 'web.test.time[L2-Performance,Medir tempo de resposta,resp]'
      })
      const l1Item = items.find(function (i) {
        return i.key_ === 'web.test.fail[L1-Disponibilidade]'
      })
      return Promise.all([
        l3kpiFetchSpark(rpc, l2Item ? l2Item.itemid : null),
        l3kpiFetchDayBuckets(rpc, l1Item ? l1Item.itemid : null),
      ]).then(function (r2) {
        l3kpiRender(el, {
          items: items, trigs: trigs, spark: r2[0], buckets: r2[1],
          vmInfo: vmInfo, stringCheck: stringCheck, host: host,
        })
      })
    })
  }).catch(function (err) { l3kpiRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { l3kpiLoad(rpc) }, CFG_L3KPI.refreshMs)
}

function l3kpiInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(l3kpiLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-app-kpi: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { l3kpiInitWithRetry(attempt + 1) }, 100)
}

l3kpiInitWithRetry()
