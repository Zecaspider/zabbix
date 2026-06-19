// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · KPI STRIP DE DOMÍNIO  v3.0                      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  4 KPIs de domínio (wallboard NOC):                                     ║
// ║    1. Dispositivos total        (todos os grupos 24-29)                 ║
// ║    2. UP (disponíveis ICMP)                                             ║
// ║    3. DOWN / Degradado                                                  ║
// ║    4. Alertas activos           (crit / aviso)                         ║
// ║                                                                          ║
// ║  v3: grupos 24+25 (Agências) adicionados ao domínio Rede               ║
// ║  Thresholds: window.BPC.NET_THR (catálogo §4 rede-arquitectura)        ║
// ║  Detalhe por segmento → painel l2-segmentos.js (cards com drill N3)    ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_KPI_NET = {
  elementId: 'bpc-net-kpi',
  refreshMs:  60000,

  grupos: {
    wan:      ['27'],                               // 5 routers WAN (ICMP)
    dc:       ['26', '22'],                         // 7 switches DC + 1 OOB
    edif:     ['28', '29'],                         // 9 routers + 46 switches edifícios
    agencias: ['24', '25'],                         // 220 routers + 27 switches agências
    all:      ['24', '25', '26', '27', '28', '29'], // domínio completo
  },

  // Triggers — severidades que contam como crítico vs aviso
  trigPriority: { crit: [4, 5], warn: [2, 3] },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS  (usam contrato §5.1: BPC_SHARED, BPC.state, BPC.NET_THR)
// ────────────────────────────────────────────────────────────────────────────

// Estado ICMP de um host: down | warn | ok (usa catálogo NET_THR)
function kpiNetIcmpState(up, rttMs, lossPct) {
  if (up === false || up === null) return 'down'
  const T = window.BPC.NET_THR
  return window.BPC.state.worst([
    window.BPC.state.metric(rttMs,  T.rtt),
    window.BPC.state.metric(lossPct, T.loss),
  ])
}

function kpiNetPrioState(p) {
  p = parseInt(p, 10)
  if (CFG_KPI_NET.trigPriority.crit.indexOf(p) !== -1) return 'crit'
  if (CFG_KPI_NET.trigPriority.warn.indexOf(p) !== -1) return 'warn'
  return 'ok'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

// ICMP de um conjunto de grupos → { total, down, warn, ok, worst }
async function kpiNetFetchIcmp(rpc, groupIds) {
  const items = await rpc('item.get', {
    groupids: groupIds,
    search:   { key_: 'icmpping' },
    filter:   { status: 0 },
    output:   ['hostid', 'key_', 'lastvalue'],
  })

  const byHost = {}
  items.forEach(function (i) {
    if (!byHost[i.hostid]) byHost[i.hostid] = { up: null, rtt: 0, loss: 0 }
    const h = byHost[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })

  const hosts  = Object.keys(byHost).map(function (k) { return byHost[k] })
  const total  = hosts.length
  const states = hosts.map(function (h) { return kpiNetIcmpState(h.up, h.rtt, h.loss) })
  const down   = states.filter(function (s) { return s === 'down' }).length
  const warn   = states.filter(function (s) { return s === 'warn' }).length
  return { total, down, warn, ok: total - down - warn, worst: window.BPC.state.worst(states) }
}

// Triggers activos → { crit, warn, total }
async function kpiNetFetchTriggers(rpc) {
  const trigs = await rpc('trigger.get', {
    groupids:  CFG_KPI_NET.grupos.all,
    filter:    { value: 1 },
    output:    ['priority'],
    monitored: true,
    only_true: true,
  })
  let crit = 0, warn = 0
  trigs.forEach(function (t) {
    const s = kpiNetPrioState(t.priority)
    if (s === 'crit') crit++
    else if (s === 'warn') warn++
  })
  return { crit, warn, total: crit + warn }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

// Tile KPI compacto (NOC strip): valor grande + label + sub-linha opcional
function kpiNetTile(opts) {
  const state  = opts.state || 'ok'
  const accent = window.BPC.state.color(state)
  const cardSt = state === 'crit' || state === 'down' ? 'down' : state
  const sub    = opts.sub
    ? '<div style="font-size:.90rem;color:var(--bpc-mute);margin-top:auto">' + opts.sub + '</div>'
    : ''
  const pill = opts.pill
    ? '<span class="bpc-pill ' + (opts.pillCls || 'ok') + '">' + opts.pill + '</span>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;gap:6px">'
    + '<div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">'
    +   '<span class="bpc-label">' + window.BPC_SHARED.esc(opts.label) + '</span>' + pill
    + '</div>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:6px">'
    +   '<span class="bpc-value-lg" style="color:' + (opts.valueColor || '#E6EDF3') + '">' + opts.value + '</span>'
    +   (opts.unit ? '<span class="bpc-value-sm bpc-mute">' + opts.unit + '</span>' : '')
    + '</div>'
    + sub
    + '</div>'
}

function kpiNetRender(el, data) {
  const all = data.all
  const trg = data.trg

  const upTotal  = all.total - all.down
  const downWarn = all.down + all.warn
  const devState = all.down > 0 ? 'down' : all.warn > 0 ? 'warn' : 'ok'
  const dwState  = all.down > 0 ? 'down' : all.warn > 0 ? 'warn' : 'ok'
  const alrtSt   = trg.crit > 0 ? 'crit' : trg.warn > 0 ? 'warn' : 'ok'

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + kpiNetTile({
        label: 'Total dispositivos', value: all.total, unit: 'dispositivos',
        state: 'ok',
        sub: 'WAN · DC · Edifícios · Agências',
      })
    + kpiNetTile({
        label: 'UP', value: upTotal, unit: '/ ' + all.total,
        state: devState,
        valueColor: all.down === 0 && all.warn === 0 ? window.BPC.state.color('ok') : '#E6EDF3',
        sub: Math.round((upTotal / (all.total || 1)) * 100) + '% disponibilidade',
      })
    + kpiNetTile({
        label: 'DOWN / Degradado', value: downWarn, unit: 'afectados',
        state: dwState,
        valueColor: downWarn > 0 ? window.BPC.state.color(dwState) : '#E6EDF3',
        sub: all.down + ' down · ' + all.warn + ' degradado',
      })
    + kpiNetTile({
        label: 'Alertas activos', value: trg.total, unit: 'alertas',
        state: alrtSt,
        valueColor: trg.total > 0 ? window.BPC.state.color(alrtSt) : '#E6EDF3',
        sub: trg.crit + ' crítico · ' + trg.warn + ' aviso',
      })
    + '</div>'
}

function kpiNetRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ KPI Rede: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function kpiNetLoad(rpc) {
  const el = document.getElementById(CFG_KPI_NET.elementId)
  if (!el) return

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + [0,1,2,3].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  Promise.all([
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.all),
    kpiNetFetchTriggers(rpc),
  ])
  .then(function (r) {
    kpiNetRender(el, { all: r[0], trg: r[1] })
  })
  .catch(function (err) { kpiNetRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { kpiNetLoad(rpc) }, CFG_KPI_NET.refreshMs)
}

function kpiNetInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(kpiNetLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-kpi: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { kpiNetInitWithRetry(attempt + 1) }, 100)
}

kpiNetInitWithRetry()
