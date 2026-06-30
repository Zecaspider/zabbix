// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · REDE · WAN PROVEDOR  v1.0                              ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Variável Grafana "provider" (Custom, chave do provedor como value).    ║
// ║  Lê var-provider do URL → filtra circuitos do provedor seleccionado.   ║
// ║                                                                          ║
// ║  Conteúdo:                                                               ║
// ║    — Resumo do provedor (estado, circuitos, SLA, tráfego total)         ║
// ║    — Tabela de circuitos (interface, destino, router, UP/DOWN, RTT, bps)║
// ║    — Back-link → N3 · WAN — Provedores                                 ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_P4 = {
  elementId:   'bpc-n4-wan-provedor',
  refreshMs:    60000,
  maxAgeSec:    600,

  // UID do N3 · WAN — Provedores (back-link)
  n3DashUid: 'rede-n3-wan-carriers',

  // Routers WAN (grupo 27)
  wanHostIds:   ['10838', '10839', '10840', '10996', '11001'],
  wanIntHostId: '10838',  // único com IP SLA

  // Nomes dos routers para exibição (hostid → label)
  routerNames: {
    '10838': 'WAN-INT',
    '10839': 'WAN-AG',
    '10840': 'WAN-EMIS',
    '10996': 'RTE-PARC',
    '11001': 'RTE-GTW01',
  },

  // Catálogo de provedores (label + cor por chave)
  provedores: {
    unitel:    { label: 'UNITEL',             color: '#22C55E' },
    mst:       { label: 'MST / Mstelecom',    color: '#10B981' },
    at:        { label: 'AT / Angola Telecom', color: '#F97316' },
    ita:       { label: 'ITA',                color: '#EF4444' },
    multitel:  { label: 'MULTITEL',           color: '#F59E0B' },
    ipworld:   { label: 'IPWORLD',            color: '#06B6D4' },
    connectis: { label: 'CONNECTIS',          color: '#8B5CF6' },
    azure:     { label: 'Azure',              color: '#0078D4' },
  },

  // Tokens de detecção por provedor (mesmos do N3)
  tokens: {
    azure:     ['Po2.2931', 'Po2.2932', 'EXPRESSROUTE', 'AZURE'],
    ipworld:   ['IPWORLD'],
    connectis: ['CONNECTIS'],
    multitel:  ['MULTITEL'],
    mst:       ['MST', 'MSTELECOM', 'MSTELCOM', 'KWANZA'],
    ita:       ['ITA'],
    at:        ['ATELECOM', 'BGP_PEER_AT', 'SP_EMIS_AT', 'SP_AT', '_AT_', ' AT '],
    unitel:    ['UNITEL'],
  },

  slaCarrierMap: { '65': 'ita' },

  excludeRe: /^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|Ethernet[0-9]\/[0-9]\/[0-9]+$|Te[0-9]\/[0-9]\/[0-9]+$|Gi0\/0\/[0-9]$|Gi0\/0\/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)/i,
  excludeDescRe: /^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)/i,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function p4Esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  })
}

function p4Stale(clock) {
  return !clock || (Math.floor(Date.now() / 1000) - parseInt(clock, 10)) > CFG_P4.maxAgeSec
}

function p4FmtBps(octPerSec) {
  if (octPerSec == null || isNaN(octPerSec) || octPerSec < 0) return '—'
  var bps = octPerSec * 8
  if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' Gbps'
  if (bps >= 1e6) return (bps / 1e6).toFixed(0) + ' Mbps'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' Kbps'
  return bps.toFixed(0) + ' bps'
}

function p4ParseIf(name) {
  var m = /Interface\s+([^(\s]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

function p4DestLabel(ifname, desc) {
  var s = desc || ifname
  if (/BGP_PEER/i.test(s))            return 'Internet BGP'
  if (/SP_EMIS/i.test(s))             return 'EMIS'
  if (/DMVPN_HUB.*EDIFICIO/i.test(s)) return 'Agências Edif'
  if (/DMVPN_HUB/i.test(s))           return 'Agências DC'
  if (/EXPRESSROUTE|Po2\.293[12]/i.test(s + ifname)) return 'Azure ER'
  if (/MINFIN/i.test(s))              return 'MINFIN'
  if (/INSS/i.test(s))                return 'INSS'
  if (/BODIVA/i.test(s))              return 'BODIVA'
  if (/BNA/i.test(s))                 return 'BNA'
  if (/MJDH/i.test(s))               return 'MJDH'
  if (/MSTELCOM|MST.*FIBRA/i.test(s)) return 'MST Fibra'
  if (/MST.*VSAT/i.test(s))           return 'MST VSAT'
  if (/MST.*MW/i.test(s))             return 'MST MW'
  return s.length > 0 ? s.substring(0, 30) : ifname
}

function p4DetectProvedor(ifname, desc) {
  var haystack = (ifname + ' ' + desc).toUpperCase()
  var order = ['azure', 'ipworld', 'connectis', 'multitel', 'mst', 'ita', 'at', 'unitel']
  for (var i = 0; i < order.length; i++) {
    var key = order[i]
    var toks = CFG_P4.tokens[key] || []
    for (var j = 0; j < toks.length; j++) {
      if (haystack.indexOf(toks[j].toUpperCase()) !== -1) return key
    }
  }
  return null
}

function p4ReadProvider() {
  return (new URLSearchParams(window.location.search)).get('var-provider') || ''
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function p4Fetch(rpc) {
  var hids = CFG_P4.wanHostIds
  return Promise.all([
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.status' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.in' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.out' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    rpc('item.get', {
      hostids: [CFG_P4.wanIntHostId], filter: { status: 0 },
      search: { key_: 'rttMonCtrlAdmin' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
  ]).then(function(r) {
    return { ifStatus: r[0], ifIn: r[1], ifOut: r[2], ipsla: r[3] }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function p4Compute(data, provKey) {
  // IP SLA index
  var slaIdx = {}
  data.ipsla.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_)
    if (!m) return
    var field = m[1], idx = m[2]
    if (!slaIdx[idx]) slaIdx[idx] = {}
    slaIdx[idx][field] = { val: it.lastvalue, stale: p4Stale(it.lastclock) }
  })

  // SLA deste provedor
  var provSla = null
  Object.keys(CFG_P4.slaCarrierMap).forEach(function(idx) {
    if (CFG_P4.slaCarrierMap[idx] !== provKey) return
    if (!slaIdx[idx] || !slaIdx[idx]['Sense']) return
    var sd = slaIdx[idx]
    provSla = {
      ok:    !sd['Sense'].stale && sd['Sense'].val === '1',
      rttMs: sd['CompletionTime'] ? parseInt(sd['CompletionTime'].val, 10) : null,
      stale: sd['Sense'].stale,
    }
  })

  // Tráfego index
  var trafficIdx = {}
  function indexTraffic(items, field) {
    items.forEach(function(it) {
      var p = p4ParseIf(it.name)
      if (!p) return
      var k = it.hostid + '|' + p.ifname
      if (!trafficIdx[k]) trafficIdx[k] = {}
      trafficIdx[k][field] = p4Stale(it.lastclock) ? null : parseFloat(it.lastvalue)
    })
  }
  indexTraffic(data.ifIn,  'inBps')
  indexTraffic(data.ifOut, 'outBps')

  // Filtrar circuitos do provedor seleccionado
  var circuits = []
  data.ifStatus.forEach(function(it) {
    var p = p4ParseIf(it.name)
    if (!p || !p.ifname) return
    if (CFG_P4.excludeRe.test(p.ifname)) return
    if (p.desc && CFG_P4.excludeDescRe.test(p.desc)) return
    if (p4DetectProvedor(p.ifname, p.desc) !== provKey) return

    var isUp    = it.lastvalue === '1'
    var isStale = p4Stale(it.lastclock)
    var slaFail = provSla && !provSla.stale && !provSla.ok
    var effDown = !isUp || slaFail
    var tk      = it.hostid + '|' + p.ifname
    var traffic = trafficIdx[tk] || {}

    circuits.push({
      ifname:  p.ifname,
      desc:    p.desc,
      dest:    p4DestLabel(p.ifname, p.desc),
      router:  CFG_P4.routerNames[it.hostid] || it.hostid,
      up:      isUp,
      stale:   isStale,
      effDown: effDown,
      inBps:   traffic.inBps  != null ? traffic.inBps  : null,
      outBps:  traffic.outBps != null ? traffic.outBps : null,
    })
  })

  // Ordenar: effDown primeiro, depois por destino
  circuits.sort(function(a, b) {
    if (a.effDown !== b.effDown) return a.effDown ? -1 : 1
    return a.dest < b.dest ? -1 : 1
  })

  var total   = circuits.length
  var upCount = circuits.filter(function(c) { return !c.effDown }).length
  var downCount = total - upCount
  var totalIn  = circuits.reduce(function(a, c) { return a + (c.inBps  || 0) }, 0)
  var totalOut = circuits.reduce(function(a, c) { return a + (c.outBps || 0) }, 0)

  return {
    provKey:    provKey,
    circuits:   circuits,
    total:      total,
    upCount:    upCount,
    downCount:  downCount,
    totalIn:    totalIn,
    totalOut:   totalOut,
    sla:        provSla,
  }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function p4RenderSummary(model, provCfg) {
  var T     = window.BPC.THEME
  var color = provCfg ? provCfg.color : '#64748B'

  var stateColor, stateTxt
  if (model.downCount > 0) {
    stateColor = T.colorCrit
    stateTxt   = model.downCount + ' circuito(s) DOWN'
  } else if (model.sla && !model.sla.ok && !model.sla.stale) {
    stateColor = T.colorWarn
    stateTxt   = 'SLA FAIL'
  } else {
    stateColor = T.colorOk
    stateTxt   = 'Operacional'
  }

  var slaHtml = ''
  if (model.sla) {
    var sc = model.sla.stale ? T.colorMute : (model.sla.ok ? T.colorOk : T.colorCrit)
    var st = model.sla.stale ? 'SLA ?' : (model.sla.ok ? 'SLA OK' : 'SLA FAIL')
    if (!model.sla.stale && model.sla.rttMs != null) st += ' · RTT ' + model.sla.rttMs + ' ms'
    slaHtml = '<span style="font-size:.82rem;font-weight:700;color:' + sc + ';margin-left:16px">' + p4Esc(st) + '</span>'
  }

  // Back-link
  var backLink = CFG_P4.n3DashUid
    ? '<a href="/d/' + CFG_P4.n3DashUid + '" style="font-size:.78rem;color:var(--bpc-mute);text-decoration:none">← N3 · WAN — Provedores</a>'
    : ''

  return '<div style="background:rgba(14,20,60,0.55);border:1px solid rgba(255,255,255,0.07);'
    + 'border-left:4px solid ' + color + ';border-radius:8px;padding:16px 20px;margin-bottom:16px">'

    // Linha de topo: back-link + título + estado
    + '<div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap">'
    + backLink
    + '<span style="font-size:1.1rem;font-weight:800;letter-spacing:.05em;color:' + color + ';margin-left:auto">'
    + p4Esc(provCfg ? provCfg.label : model.provKey.toUpperCase())
    + '</span>'
    + '<span style="font-size:.95rem;font-weight:700;color:' + stateColor + '">' + p4Esc(stateTxt) + '</span>'
    + slaHtml
    + '</div>'

    // Métricas rápidas
    + '<div style="display:flex;gap:24px;flex-wrap:wrap">'
    + '<span style="font-size:.85rem;color:#CDD9E5">'
    + '<strong>' + model.upCount + '/' + model.total + '</strong>'
    + ' <span style="color:var(--bpc-mute)">circuitos UP</span></span>'
    + '<span style="font-size:.85rem;color:' + T.colorOk + '">↓ ' + p4FmtBps(model.totalIn)  + '</span>'
    + '<span style="font-size:.85rem;color:#60A5FA">↑ ' + p4FmtBps(model.totalOut) + '</span>'
    + '</div>'

    + '</div>'
}

function p4RenderCircuitsTable(circuits) {
  var T = window.BPC.THEME

  if (circuits.length === 0) {
    return '<div style="padding:16px;color:var(--bpc-mute);font-size:.85rem">Sem circuitos identificados para este provedor.</div>'
  }

  var rows = circuits.map(function(c) {
    var stateColor = c.stale ? T.colorMute : (c.effDown ? T.colorCrit : T.colorOk)
    var stateLbl   = c.stale ? '?' : (c.effDown ? 'DOWN' : 'UP')
    var dot = '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;'
      + 'background:' + stateColor + ';margin-right:5px;flex-shrink:0"></span>'

    return '<tr style="border-top:1px solid rgba(255,255,255,0.05)">'
      + '<td style="padding:8px 10px;font-size:.82rem;color:#CDD9E5;font-weight:600">' + p4Esc(c.dest) + '</td>'
      + '<td style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute)">'  + p4Esc(c.ifname) + '</td>'
      + '<td style="padding:8px 10px;font-size:.78rem;color:var(--bpc-mute)">'  + p4Esc(c.router) + '</td>'
      + '<td style="padding:8px 10px;font-size:.80rem;font-weight:700;color:' + stateColor + '">'
      + dot + stateLbl + '</td>'
      + '<td style="padding:8px 10px;font-size:.78rem;color:' + T.colorOk + '">↓ ' + p4FmtBps(c.inBps)  + '</td>'
      + '<td style="padding:8px 10px;font-size:.78rem;color:#60A5FA">↑ '            + p4FmtBps(c.outBps) + '</td>'
      + '</tr>'
  }).join('')

  return '<div style="background:rgba(14,20,60,0.40);border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden">'
    + '<table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:rgba(255,255,255,0.04)">'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">Destino</th>'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">Interface</th>'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">Router</th>'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">Estado</th>'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">In</th>'
    + '<th style="padding:8px 10px;font-size:.75rem;color:var(--bpc-mute);font-weight:600;text-align:left">Out</th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '</div>'
}

function p4Render(el, model) {
  var provCfg = CFG_P4.provedores[model.provKey] || null

  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + p4RenderSummary(model, provCfg)
    + p4RenderCircuitsTable(model.circuits)
    + '</div>'
}

function p4RenderEmpty(el, provKey) {
  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif;padding:20px;color:var(--bpc-mute)">'
    + 'Nenhum provedor seleccionado. Use o selector no topo do dashboard.'
    + '</div>'
}

function p4RenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ WAN Provedor: ' + p4Esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function p4Load(rpc) {
  var el = document.getElementById(CFG_P4.elementId)
  if (!el) return

  var provKey = p4ReadProvider()
  if (!provKey) { p4RenderEmpty(el, provKey); return }

  el.innerHTML = '<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar provedor ' + p4Esc(provKey) + '…</div>'

  p4Fetch(rpc)
    .then(function(data) { p4Render(el, p4Compute(data, provKey)) })
    .catch(function(err) { p4RenderError(el, err.message || String(err)) })

  window.BPC.utils.startRefresh(el, function() { p4Load(rpc) }, CFG_P4.refreshMs)
}

function p4InitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(p4Load); return }
  if (attempt > 50) { console.error('[BPC] l4-wan-provedor: waitForBPC nunca disponivel'); return }
  setTimeout(function() { p4InitWithRetry(attempt + 1) }, 100)
}

p4InitWithRetry()
