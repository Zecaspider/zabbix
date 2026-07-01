// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN PROVEDORES  v3.0                            ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Layout:                                                                 ║
// ║    Row 1 — KPI strip (total / UP / provedores c/ problema / SLA FAIL)  ║
// ║    Row 2 — Cards por provedor com breakdown de serviço:                 ║
// ║              🌐 Internet (BGP)  🏦 Agências (DMVPN)                    ║
// ║              💳 EMIS            🏛 Gov/Parc                             ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_PROV = {
  elementId: 'bpc-wan-provedores',
  refreshMs:  60000,
  maxAgeSec:  600,

  n4DashUid: 'rede-n4-wan-provedor',

  wanHostIds:   ['10838', '10839', '10840', '10996', '11001'],
  wanIntHostId: '10838',

  provedores: [
    { key: 'unitel',   label: 'UNITEL',             color: '#22C55E', tokens: ['UNITEL'] },
    { key: 'mst',      label: 'MST / Mstelecom',    color: '#10B981', tokens: ['MST', 'MSTELECOM', 'MSTELCOM', 'KWANZA'] },
    { key: 'at',       label: 'AT / Angola Telecom', color: '#F97316', tokens: ['ATELECOM', 'BGP_PEER_AT', 'SP_EMIS_AT', 'SP_AT', '_AT_', ' AT '] },
    { key: 'ita',      label: 'ITA',                color: '#EF4444', tokens: ['ITA'] },
    { key: 'multitel', label: 'MULTITEL',            color: '#F59E0B', tokens: ['MULTITEL'] },
    { key: 'ipworld',  label: 'IPWORLD',             color: '#06B6D4', tokens: ['IPWORLD'] },
    { key: 'connectis',label: 'CONNECTIS',           color: '#8B5CF6', tokens: ['CONNECTIS'] },
    { key: 'azure',    label: 'Azure',               color: '#0078D4', tokens: ['Po2.2931', 'Po2.2932', 'EXPRESSROUTE', 'AZURE'] },
  ],

  cats: [
    { key: 'internet', icon: '🌐', label: 'Internet' },
    { key: 'agencias', icon: '🏦', label: 'Agências' },
    { key: 'emis',     icon: '💳', label: 'EMIS' },
    { key: 'parc',     icon: '🏛', label: 'Gov / Parc' },
  ],

  // IP SLA index -> circuito específico que ele mede (não o provedor inteiro).
  // SLA 65 mede só o link Internet do WAN-INT (Po2.65, BGP_PEER_ITA) — os
  // outros circuitos do mesmo provedor (túneis DMVPN, P2P) são independentes
  // e não devem herdar o estado deste SLA (rede-topologia.md §4.6).
  slaCircuitMap: { '65': { provider: 'ita', hostid: '10838', ifname: 'Po2.65' } },

  excludeRe: /^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|Ethernet[0-9]\/[0-9]\/[0-9]+$|Te[0-9]\/[0-9]\/[0-9]+$|Gi0\/0\/[0-9]$|Gi0\/0\/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)/i,
  excludeDescRe: /^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)/i,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function pEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  })
}

function pStale(clock) {
  return !clock || (Math.floor(Date.now() / 1000) - parseInt(clock, 10)) > CFG_PROV.maxAgeSec
}

function pFmtBps(bps) {
  if (bps == null || isNaN(bps) || bps <= 0) return null
  if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' Gbps'
  if (bps >= 1e6) return (bps / 1e6).toFixed(0) + ' Mbps'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' Kbps'
  return bps.toFixed(0) + ' bps'
}

function pParseIf(name) {
  var m = /Interface\s+([^(\s]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function pDetectProv(ifname, desc) {
  var h = (ifname + ' ' + desc).toUpperCase()
  for (var i = 0; i < CFG_PROV.provedores.length; i++) {
    var p = CFG_PROV.provedores[i]
    for (var j = 0; j < p.tokens.length; j++) {
      if (h.indexOf(p.tokens[j].toUpperCase()) !== -1) return p.key
    }
  }
  return null
}

// Categoriza o circuito em internet / agencias / emis / parc
function pCategory(ifname, desc) {
  if (/BGP_PEER/i.test(desc) || /BGP_PEER/i.test(ifname)) return 'internet'
  if (/EXPRESSROUTE|Po2\.293[12]/i.test(ifname + desc))   return 'internet'
  if (/^Tu\d+/i.test(ifname) || /DMVPN_HUB/i.test(desc)) return 'agencias'
  if (/SP_EMIS|^.*EMIS/i.test(desc))                      return 'emis'
  return 'parc'
}

function pEmptyCats() {
  var o = {}
  CFG_PROV.cats.forEach(function(c) { o[c.key] = { total: 0, up: 0, down: 0 } })
  return o
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function pFetch(rpc) {
  var hids = CFG_PROV.wanHostIds
  return Promise.all([
    rpc('item.get', { hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.status' },
      output: ['hostid','name','key_','lastvalue','lastclock'] }),
    rpc('item.get', { hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.in' },
      output: ['hostid','name','key_','lastvalue','lastclock'] }),
    rpc('item.get', { hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.out' },
      output: ['hostid','name','key_','lastvalue','lastclock'] }),
    rpc('item.get', { hostids: [CFG_PROV.wanIntHostId], filter: { status: 0 },
      search: { key_: 'rttMonCtrlAdmin' },
      output: ['hostid','name','key_','lastvalue','lastclock'] }),
  ]).then(function(r) { return { ifStatus: r[0], ifIn: r[1], ifOut: r[2], ipsla: r[3] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function pBuildSlaIdx(ipslaItems) {
  var idx = {}
  ipslaItems.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_)
    if (!m) return
    var field = m[1], id = m[2]
    if (!idx[id]) idx[id] = {}
    idx[id][field] = { val: it.lastvalue, stale: pStale(it.lastclock) }
  })
  return idx
}

function pBuildTrafficIdx(inItems, outItems) {
  var idx = {}
  function index(items, field) {
    items.forEach(function(it) {
      var p = pParseIf(it.name)
      if (!p) return
      var k = it.hostid + '|' + p.ifname
      if (!idx[k]) idx[k] = {}
      idx[k][field] = pStale(it.lastclock) ? null : parseFloat(it.lastvalue) * 8
    })
  }
  index(inItems, 'inBps')
  index(outItems, 'outBps')
  return idx
}

function pProvMap(ifStatusItems, trafficIdx, slaIdx) {
  // Inicializar mapa por provedor
  var map = {}
  CFG_PROV.provedores.forEach(function(p) {
    map[p.key] = { cfg: p, total: 0, up: 0, effDown: 0,
      inBps: 0, outBps: 0, sla: null, cats: pEmptyCats() }
  })

  // Resolver SLA por carrier + qual circuito específico ele mede
  var slaCircuitKeys = {} // provider key -> hostid|ifname do circuito medido
  Object.keys(CFG_PROV.slaCircuitMap).forEach(function(idx) {
    var target = CFG_PROV.slaCircuitMap[idx]
    var sd = slaIdx[idx]
    if (!target || !map[target.provider] || !sd || !sd['Sense']) return
    map[target.provider].sla = {
      ok:    !sd['Sense'].stale && sd['Sense'].val === '1',
      rttMs: sd['CompletionTime'] ? parseInt(sd['CompletionTime'].val, 10) : null,
      stale: sd['Sense'].stale,
    }
    slaCircuitKeys[target.provider] = target.hostid + '|' + target.ifname
  })

  ifStatusItems.forEach(function(it) {
    var p = pParseIf(it.name)
    if (!p || !p.ifname) return
    if (CFG_PROV.excludeRe.test(p.ifname)) return
    if (p.desc && CFG_PROV.excludeDescRe.test(p.desc)) return

    var pk  = pDetectProv(p.ifname, p.desc)
    if (!pk || !map[pk]) return

    var g       = map[pk]
    var cat     = pCategory(p.ifname, p.desc)
    var tk      = it.hostid + '|' + p.ifname
    var tr      = trafficIdx[tk] || {}
    var isUp    = it.lastvalue === '1'
    var slaFail = g.sla && !g.sla.stale && !g.sla.ok && tk === slaCircuitKeys[pk]
    var effDown = !isUp || slaFail

    g.total++
    if (isUp) g.up++
    if (effDown) g.effDown++
    if (tr.inBps  != null) g.inBps  += tr.inBps
    if (tr.outBps != null) g.outBps += tr.outBps

    if (g.cats[cat]) {
      g.cats[cat].total++
      if (isUp) g.cats[cat].up++
      if (!isUp) g.cats[cat].down++
    }
  })

  return map
}

function pCompute(data) {
  var slaIdx     = pBuildSlaIdx(data.ipsla)
  var trafficIdx = pBuildTrafficIdx(data.ifIn, data.ifOut)
  var map        = pProvMap(data.ifStatus, trafficIdx, slaIdx)

  var groups = CFG_PROV.provedores
    .map(function(p) { return map[p.key] })
    .filter(function(g) { return g.total > 0 })

  var totalCirc  = groups.reduce(function(a, g) { return a + g.total }, 0)
  var totalUp    = groups.reduce(function(a, g) { return a + g.up }, 0)
  var provProb   = groups.filter(function(g) { return g.effDown > 0 }).length
  var slaFails   = groups.filter(function(g) { return g.sla && !g.sla.ok && !g.sla.stale }).length

  return { groups: groups, totalCirc: totalCirc, totalUp: totalUp,
           provProb: provProb, slaFails: slaFails }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function pRenderKpi(model) {
  var T   = window.BPC.THEME
  var ok  = model.provProb === 0 && model.slaFails === 0

  function kpi(value, label, color) {
    return '<div style="display:flex;flex-direction:column;align-items:center;'
      + 'padding:8px 20px;border-right:1px solid rgba(255,255,255,0.06)">'
      + '<span style="font-size:1.4rem;font-weight:800;color:' + color + '">' + pEsc(String(value)) + '</span>'
      + '<span style="font-size:.72rem;color:var(--bpc-mute);text-transform:uppercase;letter-spacing:.05em">' + pEsc(label) + '</span>'
      + '</div>'
  }

  var stateColor = ok ? T.colorOk : T.colorCrit
  var stateText  = ok ? 'Todos operacionais' : (model.provProb + ' provedor(es) com problema')

  return '<div style="display:flex;align-items:stretch;background:rgba(14,20,60,0.5);'
    + 'border:1px solid rgba(255,255,255,0.07);border-radius:8px;margin-bottom:16px;overflow:hidden">'
    + kpi(model.totalCirc, 'Circuitos', '#CDD9E5')
    + kpi(model.totalUp + '/' + model.totalCirc, 'UP agora', model.totalUp === model.totalCirc ? T.colorOk : T.colorWarn)
    + kpi(model.provProb || '—', 'Provedores c/ prob.', model.provProb > 0 ? T.colorCrit : T.colorOk)
    + kpi(model.slaFails || '—', 'SLA FAIL', model.slaFails > 0 ? T.colorCrit : T.colorOk)
    + '<div style="display:flex;align-items:center;padding:8px 20px;margin-left:auto">'
    + '<span style="font-size:.85rem;font-weight:700;color:' + stateColor + '">' + pEsc(stateText) + '</span>'
    + '</div>'
    + '</div>'
}

function pRenderCatRows(cats) {
  var T = window.BPC.THEME
  var rows = ''
  CFG_PROV.cats.forEach(function(cat) {
    var c = cats[cat.key]
    if (!c || c.total === 0) return
    var stateColor = c.down > 0 ? T.colorCrit : T.colorOk
    var label = c.down > 0
      ? (c.down + ' DOWN')
      : (c.up + '/' + c.total + ' UP')
    rows += '<div style="display:flex;align-items:center;gap:6px;'
      + 'padding:4px 0;border-top:1px solid rgba(255,255,255,0.06)">'
      + '<span style="font-size:.90rem;width:18px;text-align:center">' + cat.icon + '</span>'
      + '<span style="font-size:.88rem;color:var(--bpc-mute);flex:1">' + pEsc(cat.label) + '</span>'
      + '<span style="font-size:.88rem;font-weight:700;color:' + stateColor + '">' + pEsc(label) + '</span>'
      + '</div>'
  })
  return rows
}

function pRenderCard(grp) {
  var T     = window.BPC.THEME
  var cfg   = grp.cfg
  var link  = CFG_PROV.n4DashUid
    ? '/d/' + CFG_PROV.n4DashUid + '?var-provider=' + encodeURIComponent(cfg.key)
    : null

  var stateColor, stateLbl
  if (grp.effDown > 0) {
    stateColor = T.colorCrit; stateLbl = grp.effDown + ' DOWN'
  } else if (grp.sla && !grp.sla.ok && !grp.sla.stale) {
    stateColor = T.colorWarn; stateLbl = 'SLA FAIL'
  } else {
    stateColor = cfg.color; stateLbl = grp.up + '/' + grp.total + ' UP'
  }

  var slaHtml = ''
  if (grp.sla) {
    var sc = grp.sla.stale ? T.colorMute : (grp.sla.ok ? T.colorOk : T.colorCrit)
    var st = grp.sla.stale ? 'SLA ?' : (grp.sla.ok ? 'SLA OK' : '⚠ SLA FAIL')
    if (!grp.sla.stale && grp.sla.rttMs != null) st += ' · ' + grp.sla.rttMs + ' ms'
    slaHtml = '<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.06)">'
      + '<span style="font-size:.85rem;font-weight:700;color:' + sc + '">' + pEsc(st) + '</span>'
      + '</div>'
  }

  var inStr  = pFmtBps(grp.inBps)
  var outStr = pFmtBps(grp.outBps)
  var trafficHtml = (inStr || outStr)
    ? '<div style="display:flex;gap:12px;margin-top:7px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.06)">'
      + '<span style="font-size:.88rem;color:' + T.colorOk + '">↓ ' + (inStr || '—') + '</span>'
      + '<span style="font-size:.88rem;color:#60A5FA">↑ ' + (outStr || '—') + '</span>'
      + '</div>'
    : ''

  var footerHtml = '<div style="margin-top:10px;text-align:right">'
    + (link
      ? '<a href="' + pEsc(link) + '" style="font-size:.85rem;color:' + cfg.color + ';text-decoration:none;font-weight:600">Ver detalhe →</a>'
      : '<span style="font-size:.80rem;color:var(--bpc-mute)">N4 em breve</span>')
    + '</div>'

  // Borda do card reflecte ESTADO, não brand color — evita AT(laranja) e ITA(vermelho) parecerem em problema
  var borderColor = grp.effDown > 0 ? T.colorCrit
    : (grp.sla && !grp.sla.ok && !grp.sla.stale ? T.colorWarn
    : 'rgba(255,255,255,0.15)')
  var critGlow = grp.effDown > 0 ? ';box-shadow:0 0 0 1px ' + T.colorCrit + '55' : ''
  var style = 'flex:1 1 260px;max-width:360px;background:rgba(14,20,60,0.55);'
    + 'border:1px solid rgba(255,255,255,0.07);border-left:4px solid ' + borderColor + ';'
    + 'border-radius:8px;padding:14px 16px' + critGlow

  return '<div style="' + style + '">'
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">'
    + '<span style="font-size:1.05rem;font-weight:800;letter-spacing:.04em;color:' + cfg.color + '">' + pEsc(cfg.label) + '</span>'
    + '<span style="margin-left:auto;font-size:.90rem;font-weight:700;color:' + stateColor + '">' + pEsc(stateLbl) + '</span>'
    + '</div>'
    + pRenderCatRows(grp.cats)
    + slaHtml
    + trafficHtml
    + footerHtml
    + '</div>'
}

function pRender(el, model) {
  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + pRenderKpi(model)
    + '<div style="display:flex;flex-wrap:wrap;gap:14px">'
    + model.groups.map(pRenderCard).join('')
    + '</div>'
    + '</div>'
}

function pRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ WAN Provedores: ' + pEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function pLoad(rpc) {
  var el = document.getElementById(CFG_PROV.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar provedores WAN…</div>'
  pFetch(rpc)
    .then(function(data) { pRender(el, pCompute(data)) })
    .catch(function(err) { pRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { pLoad(rpc) }, CFG_PROV.refreshMs)
}

function pInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(pLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-provedores: waitForBPC nunca disponivel'); return }
  setTimeout(function() { pInitWithRetry(attempt + 1) }, 100)
}

pInitWithRetry()
