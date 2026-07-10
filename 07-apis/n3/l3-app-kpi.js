// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · APIS E SERVIÇOS · APP · CARTÕES DE ESTADO  v2.0         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-app — visible name do host app-* seleccionado (dropdown)        ║
// ║                                                                          ║
// ║  v2 — linguagem intuitiva (sem jargão L1/L2/L3 nos títulos):            ║
// ║    1. Está no ar?          (acesso à página — cenário L1)               ║
// ║    2. Velocidade           (tempo de resposta + sparkline 6h — L2)      ║
// ║    3. Conteúdo da página   (texto esperado presente — L3)               ║
// ║    4. Problemas activos    (contagem + idade do mais antigo)            ║
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


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function l3kpiFetchHost(rpc, appName) {
  const hosts = await rpc('host.get', {
    filter: { name: [appName] },
    output: ['hostid', 'host', 'name'],
  })
  return hosts[0] || null
}

async function l3kpiFetchItems(rpc, hostid) {
  return rpc('item.get', {
    hostids: [hostid],
    webitems: true,
    search: { key_: 'web.test.' },
    output: ['itemid', 'key_', 'lastvalue', 'lastclock'],
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


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function l3kpiTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const valueColor = state === 'mute' ? 'var(--bpc-mute)' : accent
  const sub = opts.sub
    ? '<div style="font-size:1.0rem;color:var(--bpc-mute);line-height:1.35">' + opts.sub + '</div>'
    : ''
  const extra = opts.extra || ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px 20px">'
    + '<span class="bpc-label" style="font-size:1.2rem;letter-spacing:.02em;text-transform:none;font-weight:700;color:#CDD9E5">' + opts.label + '</span>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:10px">'
    +   '<span style="font-size:2.6rem;font-weight:800;line-height:1.05;color:' + valueColor + '">' + opts.value + '</span>'
    +   (opts.valueSuffix ? '<span style="font-size:1.1rem;color:var(--bpc-mute)">' + opts.valueSuffix + '</span>' : '')
    + '</div>'
    + extra
    + sub
    + '</div>'
}

function l3kpiRender(el, data) {
  const items = {}
  data.items.forEach(function (i) { items[i.key_] = i })
  const trigs = data.trigs
  const esc = window.BPC_SHARED.esc

  function lastVal(key) { const it = items[key]; return it ? it.lastvalue : null }
  function hasData(key) { const it = items[key]; return it && parseInt(it.lastclock, 10) > 0 }
  function problemOf(levelTag) {
    return trigs.find(function (t) { return t.description.indexOf(levelTag) !== -1 })
  }

  // ── 1. Está no ar? (cenário L1-Disponibilidade) ──
  const l1Fail = problemOf('[L1]')
  const l1Time = l3kpiMs(lastVal('web.test.time[L1-Disponibilidade,Verificar disponibilidade,resp]'))
  let card1
  if (!hasData('web.test.fail[L1-Disponibilidade]')) {
    card1 = l3kpiTile({ label: 'Está no ar?', value: 'SEM DADOS', state: 'mute', sub: 'verificação não configurada' })
  } else if (l1Fail) {
    const err = lastVal('web.test.error[L1-Disponibilidade]')
    card1 = l3kpiTile({
      label: 'Está no ar?', value: 'NÃO', state: 'down',
      sub: err ? esc(String(err).slice(0, 70)) : 'a página não responde',
    })
  } else {
    card1 = l3kpiTile({
      label: 'Está no ar?', value: 'SIM', state: 'ok',
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
  if (!hasData('web.test.fail[L2-Performance]')) {
    card2 = l3kpiTile({ label: 'Velocidade', value: 'SEM DADOS', state: 'mute', sub: 'verificação não configurada' })
  } else {
    card2 = l3kpiTile({
      label: 'Velocidade',
      value: l2Time || '—',
      valueSuffix: l2Slow ? 'MAIS LENTA QUE O NORMAL' : 'normal',
      state: l2Slow ? 'warn' : 'ok',
      extra: spark,
      sub: 'tempo de resposta · últimas 6 horas',
    })
  }

  // ── 3. Conteúdo da página (cenário L3-Conteudo) ──
  const l3Fail = problemOf('[L3]')
  let card3
  if (!hasData('web.test.fail[L3-Conteudo]')) {
    card3 = l3kpiTile({ label: 'Conteúdo da página', value: 'NÃO VERIFICADO', state: 'mute', sub: 'sem texto de controlo definido para esta app' })
  } else if (l3Fail) {
    card3 = l3kpiTile({
      label: 'Conteúdo da página', value: 'ERRADO', state: 'warn',
      sub: esc(l3kpiContentError(lastVal('web.test.error[L3-Conteudo]'))),
    })
  } else {
    card3 = l3kpiTile({
      label: 'Conteúdo da página', value: 'CORRECTO', state: 'ok',
      sub: 'o texto esperado está presente na página',
    })
  }

  // ── 4. Problemas activos ──
  const total = trigs.length
  const oldest = total > 0 ? Math.min.apply(null, trigs.map(function (t) { return parseInt(t.lastchange, 10) })) : null
  const card4 = l3kpiTile({
    label: 'Problemas activos',
    value: String(total),
    valueSuffix: total === 1 ? 'problema' : 'problemas',
    state: l1Fail ? 'down' : total > 0 ? 'warn' : 'ok',
    sub: total > 0 ? 'o mais antigo começou ' + l3kpiAgeLabel(oldest) : 'nenhum — tudo saudável',
  })

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + card1 + card2 + card3 + card4 + '</div>'
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

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + [0,1,2,3].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  l3kpiFetchHost(rpc, appName).then(function (host) {
    if (!host) { l3kpiRenderError(el, 'app "' + appName + '" não encontrada'); return null }
    return Promise.all([
      l3kpiFetchItems(rpc, host.hostid),
      l3kpiFetchTriggers(rpc, host.hostid),
    ]).then(function (r) {
      const items = r[0], trigs = r[1]
      const l2Item = items.find(function (i) {
        return i.key_ === 'web.test.time[L2-Performance,Medir tempo de resposta,resp]'
      })
      return l3kpiFetchSpark(rpc, l2Item ? l2Item.itemid : null).then(function (spark) {
        l3kpiRender(el, { items: items, trigs: trigs, spark: spark })
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
