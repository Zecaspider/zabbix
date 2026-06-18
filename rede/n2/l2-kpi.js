// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · KPI STRIP DE DOMÍNIO  v2.0                      ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 KPIs de domínio (wallboard NOC — resumo, não tabela):               ║
// ║    1. Dispositivos UP / total   (ICMP, grupos 26+27+28+29)             ║
// ║    2. Disponibilidade global %                                          ║
// ║    3. Alertas activos           (crit / aviso)                         ║
// ║    4. Pior segmento             (DC / Edifícios / WAN)                 ║
// ║    5. WAN Edge                  (routers g27 UP + BGP-proxy)           ║
// ║                                                                          ║
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
    dc:    ['26', '27'],   // DC Core: fabric + routers WAN
    edif:  ['28', '29'],   // Edifícios: routers + switches
    wan:   ['27'],         // WAN edge: routers (links/providers via interfaces)
    all:   ['26', '27', '28', '29'],
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

// Triggers activos → { crit, warn }
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
  return { crit, warn }
}

// WAN edge — sinais de link (auditado em rede-topologia.md):
//   BGP-proxy : net.if.status de interfaces nomeadas BGP_PEER_* (1=UP, 2=DOWN)
//               (não há MIB BGP — só estas 3 no WAN-INT)
//   IP SLA    : rttMonCtrlAdminSense (1=OK) — VERDADE DE SERVIÇO do link
//               (oper-status UP ≠ link saudável; ex. ITA UP mas SLA NOT OK)
async function kpiNetFetchWan(rpc) {
  const res = await Promise.all([
    rpc('item.get', {
      groupids: CFG_KPI_NET.grupos.wan,
      search:   { key_: 'net.if.status' }, filter: { status: 0 },
      output:   ['name', 'lastvalue'],
    }),
    rpc('item.get', {
      groupids: CFG_KPI_NET.grupos.wan,
      search:   { key_: 'rttMonCtrlAdminSense' }, filter: { status: 0 },
      output:   ['lastvalue'],
    }),
  ])
  const ifStatus = res[0], slaSense = res[1]

  const bgp     = ifStatus.filter(function (i) { return /BGP_PEER/i.test(i.name) })
  const bgpUp   = bgp.filter(function (i) { return i.lastvalue === '1' }).length
  const slaTotal = slaSense.length
  const slaOk    = slaSense.filter(function (i) { return i.lastvalue === '1' }).length

  return { bgpTotal: bgp.length, bgpUp, slaTotal, slaOk }
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
  const all  = data.all, dc = data.dc, edif = data.edif, wan = data.wan
  const trg  = data.trg, bgp = data.bgp

  // 1 · Dispositivos UP / total
  const upTotal   = all.total - all.down
  const devState  = all.down > 0 ? 'down' : all.warn > 0 ? 'warn' : 'ok'

  // 2 · Disponibilidade global
  const avail    = all.total > 0 ? Math.round((all.ok / all.total) * 100) : 100
  const availSt  = avail === 100 ? 'ok' : avail >= 95 ? 'warn' : 'crit'

  // 3 · Alertas
  const alrtSt   = trg.crit > 0 ? 'crit' : trg.warn > 0 ? 'warn' : 'ok'

  // 4 · Pior segmento
  const segs = [
    { name: 'DC Core',   st: dc.worst },
    { name: 'Edifícios', st: edif.worst },
    { name: 'WAN',       st: wan.worst },
  ]
  const rank = { down: 3, crit: 3, warn: 2, ok: 1, mute: 0 }
  const worstSeg = segs.slice().sort(function (a, b) { return (rank[b.st] || 0) - (rank[a.st] || 0) })[0]
  const segLabel = { ok: 'Operacional', warn: 'Degradado', crit: 'Crítico', down: 'Down' }

  // 5 · WAN edge: routers (g27) + BGP-proxy + IP SLA (verdade de serviço)
  const wanUp     = wan.total - wan.down
  const bgpDown   = bgp.bgpTotal - bgp.bgpUp
  const slaNotOk  = bgp.slaTotal - bgp.slaOk
  const wanState  = (wan.down > 0 || bgpDown > 0 || slaNotOk > 0) ? (wan.down > 0 || bgpDown > 0 ? 'down' : 'warn')
                  : wan.warn > 0 ? 'warn' : 'ok'
  const bgpTxt    = bgp.bgpTotal ? 'BGP ' + bgp.bgpUp + '/' + bgp.bgpTotal : 'BGP n/d'
  const slaTxt    = bgp.slaTotal ? 'SLA ' + bgp.slaOk + '/' + bgp.slaTotal : 'SLA n/d'
  const bgpSub    = bgpTxt + ' · ' + slaTxt + (slaNotOk > 0 ? ' ⚠' : '')

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + kpiNetTile({
        label: 'Dispositivos', value: upTotal, unit: '/ ' + all.total + ' UP',
        state: devState,
        valueColor: all.down > 0 ? window.BPC.state.color('crit') : '#E6EDF3',
        sub: all.down > 0 ? all.down + ' down · ' + all.warn + ' degradado'
                          : all.warn + ' degradado',
      })
    + kpiNetTile({
        label: 'Disponibilidade', value: avail, unit: '%', state: availSt,
        valueColor: window.BPC.state.color(availSt === 'ok' ? 'ok' : availSt),
        sub: all.ok + ' de ' + all.total + ' operacionais',
      })
    + kpiNetTile({
        label: 'Alertas activos', value: trg.crit + trg.warn, state: alrtSt,
        valueColor: window.BPC.state.color(alrtSt),
        sub: trg.crit + ' crítico · ' + trg.warn + ' aviso',
      })
    + kpiNetTile({
        label: 'Pior segmento', value: worstSeg.name, state: worstSeg.st,
        valueColor: window.BPC.state.color(worstSeg.st),
        pill: segLabel[worstSeg.st] || '—',
        pillCls: worstSeg.st === 'crit' || worstSeg.st === 'down' ? 'down' : worstSeg.st,
        sub: 'de 3 segmentos de rede',
      })
    + kpiNetTile({
        label: 'WAN edge', value: wanUp, unit: '/ ' + wan.total + ' routers',
        state: wanState,
        valueColor: wan.down > 0 ? window.BPC.state.color('crit') : '#E6EDF3',
        sub: bgpSub,
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

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  Promise.all([
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.all),
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.dc),
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.edif),
    kpiNetFetchIcmp(rpc, CFG_KPI_NET.grupos.wan),
    kpiNetFetchTriggers(rpc),
    kpiNetFetchWan(rpc),
  ])
  .then(function (r) {
    kpiNetRender(el, { all: r[0], dc: r[1], edif: r[2], wan: r[3], trg: r[4], bgp: r[5] })
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
