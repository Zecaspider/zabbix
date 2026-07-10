// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · APIS E SERVIÇOS · SISTEMA · ESTADO GLOBAL + ZONA A  v1.0 ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║                                                                          ║
// ║  VARIÁVEIS GRAFANA REQUERIDAS                                           ║
// ║    var-servico — valor da tag servico do sistema (dropdown)            ║
// ║                                                                          ║
// ║  Desenho herdado da proposta arquivada (arquivo-referencia/…/servicos/  ║
// ║  ebankit/dash-servico-unificado.js): "Zona A — o que o utilizador está  ║
// ║  a sentir agora" + badge de estado global do serviço com rollup:        ║
// ║    CRÍTICO   = app fora do ar (L1) ou VM com trigger Alta/Desastre      ║
// ║    DEGRADADO = qualquer outro problema activo (L2/L3, VM em aviso)      ║
// ║    OK        = nada activo                                              ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_S4EST = {
  elementId: 'bpc-sys-estado',
  refreshMs: 60000,
  availThr: { warn: 99.5, crit: 95 }, // % disponibilidade 24h: ≥99.5 ok, ≥95 aviso, <95 crítico
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function s4estGetServico() {
  return new URLSearchParams(window.location.search).get('var-servico') || ''
}

function s4estMs(secStr) {
  const v = parseFloat(secStr)
  if (isNaN(v)) return null
  return v >= 1 ? (Math.round(v * 100) / 100) + ' s' : Math.round(v * 1000) + ' ms'
}

function s4estZoneLabel(text) {
  return '<div style="font-size:.85rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.12em;margin-bottom:8px;display:flex;align-items:center;gap:10px">'
    + text + '<div style="flex:1;height:1px;background:rgba(255,255,255,.09)"></div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function s4estFetch(rpc, servico) {
  const hosts = await rpc('host.get', {
    filter: { status: 0 },
    output: ['hostid', 'host', 'name'],
    tags: [{ tag: 'servico', value: servico, operator: 1 }],
  })
  const apps = hosts.filter(function (h) { return /^app-/i.test(h.host) })
  const vms = hosts.filter(function (h) { return !/^app-/i.test(h.host) })

  const appIds = apps.map(function (a) { return a.hostid })
  const vmIds = vms.map(function (v) { return v.hostid })

  const fetches = [
    appIds.length ? rpc('item.get', {
      hostids: appIds, webitems: true,
      search: { key_: 'web.test.' },
      output: ['itemid', 'hostid', 'key_', 'lastvalue', 'lastclock'],
    }) : Promise.resolve([]),
    appIds.length ? rpc('trigger.get', {
      hostids: appIds, filter: { value: 1 },
      output: ['description', 'priority'],
      monitored: true, only_true: true,
    }) : Promise.resolve([]),
    vmIds.length ? rpc('trigger.get', {
      hostids: vmIds, filter: { value: 1 },
      output: ['triggerid', 'priority'],
      monitored: true, only_true: true,
    }) : Promise.resolve([]),
  ]
  const r = await Promise.all(fetches)
  const items = r[0], appTrigs = r[1], vmTrigs = r[2]

  // disponibilidade 24h — média das falhas L1 (histórico UINT), pior app
  const failItems = items.filter(function (i) { return i.key_ === 'web.test.fail[L1-Disponibilidade]' })
  let avail = null
  if (failItems.length) {
    const hist = await rpc('history.get', {
      itemids: failItems.map(function (i) { return i.itemid }),
      history: 3,
      time_from: Math.floor(Date.now() / 1000) - 86400,
      output: 'extend',
    })
    const byItem = {}
    hist.forEach(function (row) {
      if (!byItem[row.itemid]) byItem[row.itemid] = { fail: 0, n: 0 }
      byItem[row.itemid].fail += parseInt(row.value, 10) > 0 ? 1 : 0
      byItem[row.itemid].n++
    })
    const avails = Object.keys(byItem).map(function (id) {
      const b = byItem[id]
      return b.n ? 100 * (1 - b.fail / b.n) : null
    }).filter(function (v) { return v != null })
    if (avails.length) avail = Math.min.apply(null, avails) // pior app do serviço
  }

  return { apps: apps, items: items, appTrigs: appTrigs, vmTrigs: vmTrigs, avail: avail }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function s4estTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const valueColor = state === 'mute' ? 'var(--bpc-mute)' : accent
  const sub = opts.sub
    ? '<div style="font-size:.95rem;color:var(--bpc-mute);line-height:1.3">' + opts.sub + '</div>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;justify-content:center;gap:6px;padding:14px 18px">'
    + '<span class="bpc-label" style="font-size:1.1rem;letter-spacing:.02em;text-transform:none;font-weight:700;color:#CDD9E5">' + opts.label + '</span>'
    + '<span style="font-size:' + (opts.big ? '2.4rem' : '2.1rem') + ';font-weight:800;line-height:1.05;color:' + valueColor + '">' + opts.value + '</span>'
    + sub
    + '</div>'
}

function s4estRender(el, data) {
  const esc = window.BPC_SHARED.esc
  const items = {}
  // agregação pior-caso quando o serviço tem >1 monitor sintético
  data.items.forEach(function (i) {
    const cur = items[i.key_]
    if (!cur) { items[i.key_] = i; return }
    if (parseFloat(i.lastvalue) > parseFloat(cur.lastvalue)) items[i.key_] = i
  })
  function lastVal(key) { const it = items[key]; return it ? it.lastvalue : null }
  function hasData(key) { const it = items[key]; return it && parseInt(it.lastclock, 10) > 0 }

  const l1Fail = data.appTrigs.some(function (t) { return /\[L1\]|indispon/i.test(t.description) })
  const l2Slow = data.appTrigs.some(function (t) { return /\[L2\]/i.test(t.description) })
  const l3Bad  = data.appTrigs.some(function (t) { return /\[L3\]/i.test(t.description) })
  const vmCrit = data.vmTrigs.some(function (t) { return parseInt(t.priority, 10) >= 4 })
  const totalProblems = data.appTrigs.length + data.vmTrigs.length

  // ── Badge de estado global (rollup) ──
  let gState, gLabel, gSub
  if (l1Fail || vmCrit) {
    gState = 'down'; gLabel = 'CRÍTICO'
    gSub = l1Fail ? 'aplicação fora do ar' : 'infraestrutura com falha grave'
  } else if (totalProblems > 0) {
    gState = 'warn'; gLabel = 'DEGRADADO'
    gSub = totalProblems + (totalProblems === 1 ? ' problema activo' : ' problemas activos') + ' no serviço'
  } else {
    gState = 'ok'; gLabel = 'SERVIÇO OK'
    gSub = 'sintéticos e infraestrutura saudáveis'
  }
  const badge = s4estTile({ label: 'Estado do serviço', value: gLabel, state: gState, sub: gSub, big: true })

  const nApps = data.apps.length
  const appNote = nApps > 1 ? ' · ' + nApps + ' monitores' : ''

  // ── Zona A — cards sintéticos ──
  const l1Time = s4estMs(lastVal('web.test.time[L1-Disponibilidade,Verificar disponibilidade,resp]'))
  const card1 = !nApps
    ? s4estTile({ label: 'Está no ar?', value: 'SEM MONITOR', state: 'mute', sub: 'serviço sem verificação sintética' })
    : l1Fail
      ? s4estTile({ label: 'Está no ar?', value: 'NÃO', state: 'down', sub: 'a aplicação não responde' + appNote })
      : s4estTile({ label: 'Está no ar?', value: 'SIM', state: 'ok', sub: (l1Time ? 'resposta em ' + l1Time : 'acessível') + appNote })

  const l2Time = s4estMs(lastVal('web.test.time[L2-Performance,Medir tempo de resposta,resp]'))
  const card2 = !nApps || !hasData('web.test.fail[L2-Performance]')
    ? s4estTile({ label: 'Velocidade', value: '—', state: 'mute', sub: 'sem verificação' })
    : s4estTile({
        label: 'Velocidade', value: l2Time || '—',
        state: l2Slow ? 'warn' : 'ok',
        sub: l2Slow ? 'mais lenta que o normal' + appNote : 'dentro do normal' + appNote,
      })

  const card3 = !nApps || !hasData('web.test.fail[L3-Conteudo]')
    ? s4estTile({ label: 'Conteúdo da página', value: '—', state: 'mute', sub: 'sem texto de controlo' })
    : l3Bad
      ? s4estTile({ label: 'Conteúdo da página', value: 'ERRADO', state: 'warn', sub: 'texto esperado em falta' + appNote })
      : s4estTile({ label: 'Conteúdo da página', value: 'CORRECTO', state: 'ok', sub: 'texto esperado presente' + appNote })

  let card4
  if (data.avail == null) {
    card4 = s4estTile({ label: 'Disponibilidade 24h', value: '—', state: 'mute', sub: 'sem histórico' })
  } else {
    const aState = data.avail >= CFG_S4EST.availThr.warn ? 'ok' : data.avail >= CFG_S4EST.availThr.crit ? 'warn' : 'crit'
    card4 = s4estTile({
      label: 'Disponibilidade 24h',
      value: (Math.round(data.avail * 100) / 100) + '%',
      state: aState,
      sub: nApps > 1 ? 'pior dos ' + nApps + ' monitores' : 'últimas 24 horas',
    })
  }

  el.innerHTML = s4estZoneLabel('O que o utilizador está a sentir agora')
    + '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr 1fr;gap:12px;height:calc(100% - 28px)">'
    + badge + card1 + card2 + card3 + card4 + '</div>'
}

function s4estRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Estado do serviço: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function s4estLoad(rpc) {
  const el = document.getElementById(CFG_S4EST.elementId)
  if (!el) return

  const servico = s4estGetServico()
  if (!servico) {
    el.innerHTML = '<div class="bpc bpc-card"><div class="bpc-error-msg">Selecciona um sistema no menu acima.</div></div>'
    return
  }

  el.innerHTML = '<div style="display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr 1fr;gap:12px;height:100%">'
    + [0,1,2,3,4].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  s4estFetch(rpc, servico).then(function (data) {
    s4estRender(el, data)
  }).catch(function (err) { s4estRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { s4estLoad(rpc) }, CFG_S4EST.refreshMs)
}

function s4estInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(s4estLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l4-sys-estado: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { s4estInitWithRetry(attempt + 1) }, 100)
}

s4estInitWithRetry()
