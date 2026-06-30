// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N2 · REDE · CARDS DE SEGMENTO  v1.0                         ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  3 cards de segmento (porta de entrada para os N3):                     ║
// ║    DC Core   (26+27) → N3 a75e2ba6                                      ║
// ║    Edifícios (28+29) → N3 471f2208                                      ║
// ║    WAN       (27)    → N3 (em breve — 4.6)                              ║
// ║                                                                          ║
// ║  Cada card: estado agregado · UP/down/degradado · disponib. · RTT/perda ║
// ║  drill para o N3 respectivo. Thresholds: window.BPC.NET_THR.            ║
// ║                                                                          ║
// ║  [1] CFG   [2] HELPERS   [3] FETCH   [4] RENDER   [5] BOOTSTRAP        ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

const CFG_SEG = {
  elementId: 'bpc-net-seg',
  refreshMs:  60000,

  segmentos: [
    { key: 'wan',  label: 'WAN',       icon: '🌐', groupIds: ['27'],
      desc: 'Internet · EMIS · Agências · Parceiros · Azure/Gov',
      dashUid: 'rede.n3.wan', dashSlug: 'n3-c2b7-wan' },
    { key: 'dc',   label: 'DC Fabric', icon: '🖥',  groupIds: ['26', '22'],
      desc: '7 switches Spine-Leaf + 1 OOB (DC1)',
      dashUid: 'rede.n3.dc', dashSlug: 'n3-c2b7-rede-dc-fabric' },
    { key: 'edif', label: 'Edifícios', icon: '🏢', groupIds: ['28', '29'],
      desc: '9 routers + 46 switches · 4 edifícios BPC',
      dashUid: 'rede.n3.edificios', dashSlug: 'n3-rede-edificios' },
    { key: 'ag',   label: 'Agências',  icon: '🏦', groupIds: ['24', '25'],
      desc: '220 routers + 27 switches · 220 agências',
      dashUid: 'rede.n3.agencias', dashSlug: 'n3-c2b7-agencias' },
  ],
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS  (contrato §5.1: BPC_SHARED, BPC.state, BPC.NET_THR)
// ────────────────────────────────────────────────────────────────────────────

function segIcmpState(up, rttMs, lossPct) {
  if (up === false || up === null) return 'down'
  const T = window.BPC.NET_THR
  return window.BPC.state.worst([
    window.BPC.state.metric(rttMs,  T.rtt),
    window.BPC.state.metric(lossPct, T.loss),
  ])
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

async function segFetchIcmp(rpc, groupIds) {
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
  const states = hosts.map(function (h) { return segIcmpState(h.up, h.rtt, h.loss) })
  const down   = states.filter(function (s) { return s === 'down' }).length
  const warn   = states.filter(function (s) { return s === 'warn' }).length

  const upHosts = hosts.filter(function (h) { return h.up !== false })
  const avg = function (arr) { return arr.length ? arr.reduce(function (a, b) { return a + b }, 0) / arr.length : 0 }
  const avgRtt  = avg(upHosts.map(function (h) { return h.rtt }).filter(function (v) { return v > 0 }))
  const avgLoss = avg(upHosts.map(function (h) { return h.loss }).filter(function (v) { return v >= 0 }))

  return { total, down, warn, ok: total - down - warn, avgRtt, avgLoss, worst: window.BPC.state.worst(states) }
}


// WAN: NÃO contamos "links" (não há entidade discreta no Zabbix — só sub-interfaces
//   nomeadas; qualquer total é frágil e duplica os _EDIFICIO). Em vez disso,
//   estado POR CATEGORIA (auditoria rede-topologia.md):
//     - categoria = router (hostid) → mapa estável, não regex de nome
//     - Internet  → verdade de serviço = IP SLA + BGP (sinais deliberados)
//     - restantes → estado por interfaces DOWN (down é inequívoco; total não importa)
//   "link de serviço" de uma categoria = interface com descrição entre parênteses
//   (nomeada pela equipa de rede); deduplicamos variantes _EDIFICIO no down-count.
const SEG_WAN_CATS = [
  { key: 'inet', label: 'Internet',   hostids: ['10838'], inet: true },  // DC1-RTE-WAN-INT
  { key: 'emis', label: 'EMIS',       hostids: ['10839'] },              // DC1-RTE-WAN-EMIS
  { key: 'ag',   label: 'Agências',   hostids: ['10996'] },              // DC1-RTE-WAN-AG (hub DMVPN)
  { key: 'parc', label: 'Parceiros',  hostids: ['11001'] },              // PARC
  { key: 'az',   label: 'Azure/Gov',  hostids: ['10840'] },              // GTW01 (ExpressRoute + Gov)
]
const SEG_WAN_DESC = /\(([^)]+)\)/   // interface nomeada pela equipa de rede

async function segFetchWanCats(rpc) {
  const res = await Promise.all([
    rpc('item.get', { groupids: ['27'], search: { key_: 'net.if.status' }, filter: { status: 0 },
                      output: ['name', 'lastvalue', 'hostid'] }),
    rpc('item.get', { groupids: ['27'], search: { key_: 'rttMonCtrlAdminSense' }, filter: { status: 0 },
                      output: ['lastvalue', 'hostid'] }),
  ])
  const ifStatus = res[0], slaSense = res[1]

  function downByHosts(hostids) {
    var down = 0
    ifStatus.forEach(function (i) {
      if (hostids.indexOf(i.hostid) === -1) return
      if (!SEG_WAN_DESC.test(i.name || '')) return       // só interfaces nomeadas
      if (i.lastvalue === '2') down++
    })
    return down
  }
  function bgpOnHosts(hostids) {
    var bgp = ifStatus.filter(function (i) {
      return hostids.indexOf(i.hostid) !== -1 && /BGP_PEER/i.test(i.name || '')
    })
    return { total: bgp.length, up: bgp.filter(function (i) { return i.lastvalue === '1' }).length }
  }
  function slaOnHosts(hostids) {
    var s = slaSense.filter(function (i) { return hostids.indexOf(i.hostid) !== -1 })
    return { total: s.length, ok: s.filter(function (i) { return i.lastvalue === '1' }).length }
  }

  var cats = SEG_WAN_CATS.map(function (c) {
    var down = downByHosts(c.hostids)
    var bgp  = c.inet ? bgpOnHosts(c.hostids) : null
    var sla  = c.inet ? slaOnHosts(c.hostids) : null
    var slaNotOk = sla ? sla.total - sla.ok : 0
    var bgpDown  = bgp ? bgp.total - bgp.up : 0
    var st = down > 0 ? 'down'
           : (slaNotOk > 0 || bgpDown > 0) ? 'warn'
           : 'ok'
    return { key: c.key, label: c.label, state: st, down: down, bgp: bgp, sla: sla }
  })

  var worst = window.BPC.state.worst(cats.map(function (c) { return c.state }))
  return { isWan: true, cats: cats, worst: worst }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

// Corpo de um card de DEVICE (DC / Edifícios): total/down/degradado + RTT/perda
function segDeviceBody(d) {
  const avail   = d.total > 0 ? Math.round((d.ok / d.total) * 100) : 100
  const availCls = avail === 100 ? 'bpc-ok' : avail >= 95 ? 'bpc-warn' : 'bpc-crit'
  const rttFmt  = d.down === d.total ? '—' : d.avgRtt.toFixed(1) + ' ms'
  const lossFmt = d.down === d.total ? '—' : d.avgLoss.toFixed(1) + '%'
  const lossCls = d.avgLoss > window.BPC.NET_THR.loss.warn ? 'bpc-warn' : 'bpc-ok'

  return ''
    + '<div class="bpc-flex bpc-gap-12">'
    +   '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-lg">' + d.total + '</span><span class="bpc-label">Total</span></div>'
    +   '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-crit">' + d.down + '</span><span class="bpc-label">Down</span></div>'
    +   '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-warn">' + d.warn + '</span><span class="bpc-label">Degradado</span></div>'
    +   '<div class="bpc-flex-col bpc-gap-4" style="margin-left:auto;text-align:right"><span class="bpc-value-md ' + availCls + '">' + avail + '%</span><span class="bpc-label">Disponib.</span></div>'
    + '</div>'
    + '<div class="bpc-flex bpc-gap-12" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">'
    +   '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm bpc-info">' + rttFmt + '</span><span class="bpc-label">RTT médio</span></div>'
    +   '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm ' + lossCls + '">' + lossFmt + '</span><span class="bpc-label">Perda média</span></div>'
    + '</div>'
}

// Corpo do card WAN: uma linha por CATEGORIA (sem total frágil de links)
function segWanBody(d) {
  const pill = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }
  const rows = d.cats.map(function (c) {
    const cls = c.state === 'crit' || c.state === 'down' ? 'down' : c.state
    const dot = window.BPC.state.color(c.state)
    // detalhe à direita: Internet → BGP+SLA; restantes → estado de links down
    var detail
    if (c.bgp) {
      const slaTxt = c.sla && c.sla.total ? 'SLA ' + c.sla.ok + '/' + c.sla.total : ''
      detail = 'BGP ' + c.bgp.up + '/' + c.bgp.total + (slaTxt ? ' · ' + slaTxt : '')
    } else {
      detail = c.down > 0 ? c.down + ' link(s) down' : 'sem links down'
    }
    return ''
      + '<div class="bpc-flex" style="justify-content:space-between;align-items:center;'
      +      'padding:5px 0;border-bottom:1px solid rgba(255,255,255,0.05)">'
      +   '<div class="bpc-flex bpc-gap-8" style="align-items:center">'
      +     '<span style="width:9px;height:9px;border-radius:50%;background:' + dot + ';display:inline-block"></span>'
      +     '<span style="font-size:.98rem;color:#E6EDF3">' + window.BPC_SHARED.esc(c.label) + '</span>'
      +   '</div>'
      +   '<div class="bpc-flex bpc-gap-8" style="align-items:center">'
      +     '<span style="font-size:.85rem;color:var(--bpc-mute)">' + detail + '</span>'
      +     '<span class="bpc-pill ' + cls + '" style="font-size:.78rem">' + (pill[c.state] || '—') + '</span>'
      +   '</div>'
      + '</div>'
  }).join('')
  return '<div style="display:flex;flex-direction:column">' + rows + '</div>'
}

function segCard(seg, d) {
  const S       = window.BPC_SHARED
  const accent  = window.BPC.state.color(d.worst)
  const cardSt  = d.worst === 'crit' || d.worst === 'down' ? 'down' : d.worst

  const pillLbl = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }[d.worst] || '—'
  const pillCls = d.worst === 'crit' || d.worst === 'down' ? 'down' : d.worst

  const body = d.isWan ? segWanBody(d) : segDeviceBody(d)

  const footer = seg.dashUid
    ? '<span style="font-size:.90rem;color:var(--bpc-cyan)">Ver detalhe (N3) →</span>'
    : '<span style="font-size:.90rem;color:var(--bpc-mute);opacity:.55">Ver detalhe (N3) →</span>'

  const inner = ''
    + '<div class="bpc bpc-card state-' + cardSt + '"'
    +      ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;gap:10px'
    +      (seg.dashUid ? ';cursor:pointer' : '') + '">'

    +   '<div class="bpc-flex" style="justify-content:space-between;align-items:flex-start">'
    +     '<div class="bpc-flex bpc-gap-8">'
    +       '<span style="font-size:1.3rem">' + seg.icon + '</span>'
    +       '<div>'
    +         '<div style="font-size:1.10rem;font-weight:700;color:#E6EDF3;line-height:1.2">' + S.esc(seg.label) + '</div>'
    +         '<div style="font-size:.85rem;color:var(--bpc-mute)">' + S.esc(seg.desc) + '</div>'
    +       '</div>'
    +     '</div>'
    +     '<span class="bpc-pill ' + pillCls + '">' + pillLbl + '</span>'
    +   '</div>'

    +   body

    +   '<div class="bpc-flex" style="justify-content:space-between;margin-top:auto;padding-top:4px">'
    +     footer
    +     '<span class="bpc-timestamp">Grupos ' + seg.groupIds.join('+') + '</span>'
    +   '</div>'

    + '</div>'

  return seg.dashUid
    ? '<a href="/d/' + seg.dashUid + '/' + seg.dashSlug + '" style="text-decoration:none;display:block;height:100%">' + inner + '</a>'
    : '<div style="height:100%">' + inner + '</div>'
}

function segRender(el, results) {
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + CFG_SEG.segmentos.map(function (seg, i) { return '<div>' + segCard(seg, results[i]) + '</div>' }).join('')
    + '</div>'
}

function segRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ Segmentos Rede: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [5] BOOTSTRAP
// ────────────────────────────────────────────────────────────────────────────

function segLoad(rpc) {
  const el = document.getElementById(CFG_SEG.elementId)
  if (!el) return

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;height:100%">'
    + CFG_SEG.segmentos.map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  Promise.all(CFG_SEG.segmentos.map(function (seg) {
    return seg.key === 'wan' ? segFetchWanCats(rpc) : segFetchIcmp(rpc, seg.groupIds)
  }))
    .then(function (results) { segRender(el, results) })
    .catch(function (err) { segRenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function () { segLoad(rpc) }, CFG_SEG.refreshMs)
}

function segInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(segLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l2-segmentos: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { segInitWithRetry(attempt + 1) }, 100)
}

segInitWithRetry()
