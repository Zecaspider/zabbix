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
    { key: 'dc',   label: 'DC Core',   icon: '🖥',  groupIds: ['26', '27'],
      desc: 'Fabric Spine-Leaf + Routers WAN',
      dashUid: 'a75e2ba6-0ecc-49ee-bceb-4bcbafb419da', dashSlug: 'n3-rede-dc-core' },
    { key: 'edif', label: 'Edifícios', icon: '🏢', groupIds: ['28', '29'],
      desc: 'Routers + Switches por andar',
      dashUid: '471f2208-d032-46d4-8d35-6fdfe770c967', dashSlug: 'n3-rede-edificios' },
    { key: 'wan',  label: 'WAN / Links', icon: '🌐', groupIds: ['27'],
      desc: 'Internet · Agências · EMIS · Parceiros',
      dashUid: null, dashSlug: null },   // N3 WAN em construção (4.6)
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


// WAN: contar LINKS reais (não routers). Auditoria em rede-topologia.md.
//   Links = interfaces de serviço/transporte (net.if.status) por marcador.
//   Saúde: oper-status DOWN (=2) + IP SLA sense≠1 (link if-UP mas serviço NOK).
const SEG_WAN_MARKER = /(BGP_PEER|DMVPN|EXPRESS ?ROUTE|MPLS|VSAT|SP_|P2P-WAN-HUB|MINFIN|INSS|BODIVA|MULTITEL|KWANZA|EMIS)/i

async function segFetchWanLinks(rpc) {
  const res = await Promise.all([
    rpc('item.get', { groupids: ['27'], search: { key_: 'net.if.status' }, filter: { status: 0 }, output: ['name', 'lastvalue'] }),
    rpc('item.get', { groupids: ['27'], search: { key_: 'rttMonCtrlAdminSense' }, filter: { status: 0 }, output: ['lastvalue'] }),
    rpc('item.get', { groupids: ['27'], search: { key_: 'rttMonCtrlAdminCompletionTime' }, filter: { status: 0 }, output: ['lastvalue'] }),
  ])
  const ifStatus = res[0], slaSense = res[1], slaRtt = res[2]

  const links = ifStatus.filter(function (i) { return SEG_WAN_MARKER.test(i.name || '') })
  const total = links.length
  const down  = links.filter(function (i) { return i.lastvalue === '2' }).length

  const slaNotOk = slaSense.filter(function (i) { return i.lastvalue !== '1' }).length  // degradado
  const rtts = slaRtt.map(function (i) { return parseFloat(i.lastvalue) })
                     .filter(function (v) { return !isNaN(v) && v > 0 })
  const avgRtt = rtts.length ? rtts.reduce(function (a, b) { return a + b }, 0) / rtts.length : null

  const worst = down > 0 ? 'down' : slaNotOk > 0 ? 'warn' : 'ok'
  return { isWan: true, total: total, down: down, warn: slaNotOk, ok: total - down - slaNotOk,
           avgRtt: avgRtt, worst: worst }
}


// ────────────────────────────────────────────────────────────────────────────
// [4] RENDER
// ────────────────────────────────────────────────────────────────────────────

function segCard(seg, d) {
  const S       = window.BPC_SHARED
  const accent  = window.BPC.state.color(d.worst)
  const cardSt  = d.worst === 'crit' || d.worst === 'down' ? 'down' : d.worst
  const avail   = d.total > 0 ? Math.round((d.ok / d.total) * 100) : 100
  const availCls = avail === 100 ? 'bpc-ok' : avail >= 95 ? 'bpc-warn' : 'bpc-crit'

  // Card normal (DC/Edif) = device ICMP; card WAN = links + IP SLA
  const totalLabel = d.isWan ? 'Links' : 'Total'
  const warnLabel  = d.isWan ? 'Degrad. SLA' : 'Degradado'
  const rttFmt = d.isWan
    ? (d.avgRtt == null ? '—' : d.avgRtt.toFixed(1) + ' ms')
    : (d.down === d.total ? '—' : d.avgRtt.toFixed(1) + ' ms')
  const rttLabel = d.isWan ? 'IP SLA RTT' : 'RTT médio'
  const lossFmt = d.isWan
    ? (d.total ? Math.round((d.ok / d.total) * 100) + '%' : '—')
    : (d.down === d.total ? '—' : d.avgLoss.toFixed(1) + '%')
  const lossCls = d.isWan
    ? (d.down > 0 ? 'bpc-crit' : d.warn > 0 ? 'bpc-warn' : 'bpc-ok')
    : (d.avgLoss > window.BPC.NET_THR.loss.warn ? 'bpc-warn' : 'bpc-ok')
  const lossLabel = d.isWan ? 'Links OK' : 'Perda média'

  const pillLbl = { ok: 'OK', warn: 'Degradado', crit: 'Crítico', down: 'Down' }[d.worst] || '—'
  const pillCls = d.worst === 'crit' || d.worst === 'down' ? 'down' : d.worst

  const footer = seg.dashUid
    ? '<span style="font-size:.90rem;color:var(--bpc-cyan)">Ver detalhe (N3) →</span>'
    : '<span style="font-size:.85rem;color:var(--bpc-mute)">N3 em construção</span>'

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

    +   '<div class="bpc-flex bpc-gap-12">'
    +     '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-lg">' + d.total + '</span><span class="bpc-label">' + totalLabel + '</span></div>'
    +     '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-crit">' + d.down + '</span><span class="bpc-label">Down</span></div>'
    +     '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-md bpc-warn">' + d.warn + '</span><span class="bpc-label">' + warnLabel + '</span></div>'
    +     '<div class="bpc-flex-col bpc-gap-4" style="margin-left:auto;text-align:right"><span class="bpc-value-md ' + availCls + '">' + avail + '%</span><span class="bpc-label">Disponib.</span></div>'
    +   '</div>'

    +   '<div class="bpc-flex bpc-gap-12" style="border-top:1px solid rgba(255,255,255,0.06);padding-top:8px">'
    +     '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm bpc-info">' + rttFmt + '</span><span class="bpc-label">' + rttLabel + '</span></div>'
    +     '<div class="bpc-flex-col bpc-gap-4"><span class="bpc-value-sm ' + lossCls + '">' + lossFmt + '</span><span class="bpc-label">' + lossLabel + '</span></div>'
    +   '</div>'

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
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;height:100%">'
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

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;height:100%">'
    + CFG_SEG.segmentos.map(function () { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'

  Promise.all(CFG_SEG.segmentos.map(function (seg) {
    return seg.key === 'wan' ? segFetchWanLinks(rpc) : segFetchIcmp(rpc, seg.groupIds)
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
