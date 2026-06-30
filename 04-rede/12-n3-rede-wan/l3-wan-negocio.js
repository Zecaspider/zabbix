// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN · VISTA DE NEGÓCIO  v1.0                   ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Vista por provider/link (não por dispositivo):                         ║
// ║    Internet   — ITA · AT · MSTELCOM (BGP_PEER_* + IP SLA)              ║
// ║    Agências   — Azure ER ×2 · DMVPN ×7 providers (UNITEL, ITA, …)     ║
// ║    EMIS       — ATELECOM · UNITEL · MSTELECOM                          ║
// ║    Parceiros  — BNA · MINFIN · INSS · BODIVA · CONNECTIS · …           ║
// ║    Gateway    — MINFIN tunnels · INSS · BODIVA · FW-Parc               ║
// ║                                                                          ║
// ║  Cada card: provider · oper-status · tráfego in/out · IP SLA RTT       ║
// ║  (IP SLA apenas Internet; demais: status + tráfego via net.if.in/out)  ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_NEG = {
  elementId: 'bpc-wan-negocio',
  refreshMs:  60000,
  maxAgeSec:  600,

  // Grupos de negócio: cada link tem name, router hostid, regex para casar
  // a descrição do item net.if.status, e opcionalmente o índice IP SLA
  groups: [
    {
      label:   'Internet / BGP',
      color:   '#00B4D8',
      icon:    '🌍',
      note:    'BGP por proxy de interface · estado real = IP SLA',
      links: [
        { name: 'ITA',      hostid: '10838', descRe: /BGP_PEER_ITA/i,      slaIdx: '65'  },
        { name: 'AT',       hostid: '10838', descRe: /BGP_PEER_AT\b/i,     slaIdx: null  },
        { name: 'MSTELCOM', hostid: '10838', descRe: /BGP_PEER_MSTELCOM/i,  slaIdx: null  },
      ],
    },
    {
      label:   'Agências',
      color:   '#22C55E',
      icon:    '🏢',
      note:    'DMVPN hub · estado por oper-status de túnel',
      links: [
        { name: 'Azure ER 1',  hostid: '10996', descRe: /Po2\.2931/i,   slaIdx: null },
        { name: 'Azure ER 2',  hostid: '10996', descRe: /Po2\.2932/i,   slaIdx: null },
        { name: 'UNITEL',      hostid: '10996', descRe: /\bTu101\b/i,   slaIdx: null },
        { name: 'ITA',         hostid: '10996', descRe: /\bTu102\b/i,   slaIdx: null },
        { name: 'IPWORLD',     hostid: '10996', descRe: /\bTu103\b/i,   slaIdx: null },
        { name: 'MULTITEL',    hostid: '10996', descRe: /\bTu104\b/i,   slaIdx: null },
        { name: 'MST FIBRA',   hostid: '10996', descRe: /\bTu105\b/i,   slaIdx: null },
        { name: 'MST VSAT',    hostid: '10996', descRe: /\bTu106\b/i,   slaIdx: null },
        { name: 'MST MW',      hostid: '10996', descRe: /\bTu107\b/i,   slaIdx: null },
      ],
    },
    {
      label:   'EMIS',
      color:   '#F0A500',
      icon:    '🏦',
      note:    'Interligação ao sistema EMIS',
      links: [
        { name: 'ATELECOM',  hostid: '10839', descRe: /SP_EMIS_ATELECOM/i,   slaIdx: null },
        { name: 'UNITEL',    hostid: '10839', descRe: /SP_EMIS_UNITEL/i,     slaIdx: null },
        { name: 'MSTELECOM', hostid: '10839', descRe: /SP_EMIS_MSTELECOM/i,  slaIdx: null },
      ],
    },
    {
      label:   'Parceiros / Gov',
      color:   '#A78BFA',
      icon:    '🤝',
      note:    'Sub-interfaces Po2 · inclui voz CUBE/CUCM (FXS idle = normal)',
      links: [
        { name: 'BNA via AT',         hostid: '11001', descRe: /AT.*BNA|BNA.*AT/i,         slaIdx: null },
        { name: 'BNA via MULTITEL',   hostid: '11001', descRe: /MULTITEL.*BNA|BNA.*MULTI/i, slaIdx: null },
        { name: 'BNA via UNITEL',     hostid: '11001', descRe: /UNITEL.*BNA|BNA.*UNITEL/i,  slaIdx: null },
        { name: 'MINFIN via AT',      hostid: '11001', descRe: /AT.*MINFIN|MINFIN.*AT/i,    slaIdx: null },
        { name: 'CONNECTIS → MJDH',   hostid: '11001', descRe: /CONNECTIS.*MJDH|MJDH/i,     slaIdx: null },
        { name: 'CONNECTIS → UCALL',  hostid: '11001', descRe: /UCALL/i,                     slaIdx: null },
        { name: 'UNITEL SIP/SMs',     hostid: '11001', descRe: /UNITEL.*(SIP|SMS|USSD|MONEY)/i, slaIdx: null },
        { name: 'Mundial Seguros',    hostid: '11001', descRe: /MUNDIAL/i,                   slaIdx: null },
      ],
    },
    {
      label:   'Gateway / Core',
      color:   '#F472B6',
      icon:    '⚙️',
      note:    'Tunnels Gov + FW Parceiros · Po1 DOWN (incidente activo)',
      links: [
        { name: 'MINFIN (Kwanza/MST)', hostid: '10840', descRe: /MINFIN.*MST|Kwanza/i,  slaIdx: null },
        { name: 'MINFIN (UNITEL)',      hostid: '10840', descRe: /MINFIN.*UNITEL/i,       slaIdx: null },
        { name: 'INSS (MULTITEL)',      hostid: '10840', descRe: /INSS/i,                 slaIdx: null },
        { name: 'BODIVA',               hostid: '10840', descRe: /BODIVA/i,               slaIdx: null },
        { name: 'FW Parceiros (P2P)',   hostid: '10840', descRe: /Gi0\/0\/0\.896/i,       slaIdx: null },
        { name: 'Po1 (Fabric)',         hostid: '10840', descRe: /^Po1$/i,                slaIdx: null },
      ],
    },
  ],

  // Todos os hostids usados (derivado dos grupos acima; mantido para fetch)
  allHostIds: ['10838', '10839', '10840', '10996', '11001'],
  wanIntHostId: '10838',
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function nEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function nStale(clock) {
  return !clock || (Math.floor(Date.now() / 1000) - parseInt(clock, 10)) > CFG_NEG.maxAgeSec
}

// Converte octets/s em texto legível (bps)
function nFmtBps(octPerSec) {
  if (octPerSec == null || isNaN(octPerSec) || octPerSec < 0) return '—'
  var bps = octPerSec * 8
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps'
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' Kbps'
  return bps.toFixed(0) + ' bps'
}

// Extrai nome de interface do campo "name" do item
function nParseIf(name) {
  var m = /Interface\s+([^(\s]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return { ifname: '', desc: '' }
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

// Dado um item de tráfego (net.if.in ou net.if.out) devolve o ifname
function nParseTrafficIf(name) {
  // "Interface X(desc): Bits received/sent"
  var m = /Interface\s+([^(\s]+)/.exec(name || '')
  return m ? m[1].trim() : ''
}

// Ponto de status colorido
function nDot(up, stale, sz) {
  var T = window.BPC.THEME
  var c = stale ? T.colorMute : (up ? T.colorOk : T.colorCrit)
  var pulse = !stale && !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  var s = sz || 9
  return '<span style="display:inline-block;width:' + s + 'px;height:' + s + 'px;border-radius:50%;'
    + 'background:' + c + ';flex-shrink:0;' + pulse + '"></span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function nFetch(rpc) {
  var hids = CFG_NEG.allHostIds
  return Promise.all([
    // Interface oper-status (fonte de estado de cada link)
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.status' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    // Tráfego IN (octets/s; usar speedtest-like para bps)
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.in' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    // Tráfego OUT
    rpc('item.get', {
      hostids: hids, filter: { status: 0 },
      search: { key_: 'net.if.out' },
      output: ['hostid', 'name', 'key_', 'lastvalue', 'lastclock'],
    }),
    // IP SLA no WAN-INT (sense + completionTime)
    rpc('item.get', {
      hostids: [CFG_NEG.wanIntHostId], filter: { status: 0 },
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

function nCompute(data) {
  // ── Índice de status por hostid+ifname ──
  var statusIdx = {}  // key: hostid+'|'+ifname → {up, stale, desc}
  data.ifStatus.forEach(function(it) {
    var p = nParseIf(it.name)
    if (!p.ifname) return
    var key = it.hostid + '|' + p.ifname
    statusIdx[key] = { up: it.lastvalue === '1', stale: nStale(it.lastclock), desc: p.desc }
  })

  // ── Índice de tráfego por hostid+ifname ──
  var trafficIdx = {}  // key: hostid+'|'+ifname → {inBps, outBps}
  function indexTraffic(items, field) {
    items.forEach(function(it) {
      var ifname = nParseTrafficIf(it.name)
      if (!ifname) return
      var key = it.hostid + '|' + ifname
      if (!trafficIdx[key]) trafficIdx[key] = {}
      trafficIdx[key][field] = nStale(it.lastclock) ? null : parseFloat(it.lastvalue)
    })
  }
  indexTraffic(data.ifIn,  'inBps')
  indexTraffic(data.ifOut, 'outBps')

  // ── Índice IP SLA por índice ──
  var slaIdx = {}  // idx → {sense, rttMs, stale}
  data.ipsla.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_)
    if (!m) return
    var field = m[1], idx = m[2]
    if (!slaIdx[idx]) slaIdx[idx] = {}
    slaIdx[idx][field] = { val: it.lastvalue, stale: nStale(it.lastclock) }
  })

  // ── Resolver cada link ──
  var groups = CFG_NEG.groups.map(function(grp) {
    var links = grp.links.map(function(lcfg) {
      // encontrar a interface no statusIdx que casa com descRe (testa ifname e desc)
      var matchKey = null
      Object.keys(statusIdx).forEach(function(key) {
        if (matchKey) return
        var parts = key.split('|')
        if (parts[0] !== lcfg.hostid) return
        var entry = statusIdx[key]
        var ifname = parts[1]
        // testa o regex contra o ifname E contra a descrição
        if (lcfg.descRe.test(ifname) || lcfg.descRe.test(entry.desc)) {
          matchKey = key
        }
      })

      var status = matchKey ? statusIdx[matchKey] : null
      var traffic = matchKey ? (trafficIdx[matchKey] || {}) : {}
      var ifname  = matchKey ? matchKey.split('|')[1] : '—'

      // IP SLA (só Internet links com slaIdx definido)
      var sla = null
      if (lcfg.slaIdx && slaIdx[lcfg.slaIdx]) {
        var sd = slaIdx[lcfg.slaIdx]
        sla = {
          sense:  sd['Sense']          ? sd['Sense'].val          : null,
          rttMs:  sd['CompletionTime'] ? sd['CompletionTime'].val : null,
          thr:    sd['Threshold']      ? sd['Threshold'].val      : null,
          stale:  sd['Sense']          ? sd['Sense'].stale        : true,
        }
      }

      var up    = status ? (!status.stale && status.up) : null
      var stale = status ? status.stale : true

      // Estado efectivo: se tem SLA e sense≠1 → down mesmo que if-UP
      var effectiveDown = up === false || (sla && !sla.stale && sla.sense !== '1')

      return {
        name:    lcfg.name,
        ifname:  ifname,
        desc:    status ? status.desc : '',
        up:      up,
        stale:   stale,
        down:    effectiveDown,
        inBps:   traffic.inBps  != null ? traffic.inBps  : null,
        outBps:  traffic.outBps != null ? traffic.outBps : null,
        sla:     sla,
        found:   !!matchKey,
      }
    })

    var downCount = links.filter(function(l) { return l.down }).length
    var unknownCount = links.filter(function(l) { return !l.found }).length
    return { cfg: grp, links: links, downCount: downCount, unknownCount: unknownCount }
  })

  var totalLinks = groups.reduce(function(a, g) { return a + g.links.length }, 0)
  var totalDown  = groups.reduce(function(a, g) { return a + g.downCount  }, 0)
  return { groups: groups, totalLinks: totalLinks, totalDown: totalDown }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function nRenderLinkCard(link, groupColor) {
  var T = window.BPC.THEME

  // ── Estado ──
  var stateColor = link.stale ? T.colorMute
    : (link.down ? T.colorCrit : (link.up ? T.colorOk : T.colorMute))
  var stateLbl = link.stale ? 'Sem dados'
    : (link.down ? 'DOWN' : (link.up ? 'UP' : '—'))
  var bgState = link.stale ? 'rgba(255,255,255,0.02)'
    : (link.down ? 'rgba(248,81,73,0.08)' : 'rgba(34,197,94,0.05)')

  // ── IP SLA badge ──
  var slaBadge = ''
  if (link.sla) {
    var sOk    = !link.sla.stale && link.sla.sense === '1'
    var sColor = link.sla.stale ? T.colorMute : (sOk ? T.colorOk : T.colorCrit)
    var rtt    = link.sla.rttMs != null ? link.sla.rttMs + ' ms' : '—'
    slaBadge = '<div style="margin-top:6px;padding:4px 7px;border-radius:5px;'
      + 'background:' + sColor + '18;border:1px solid ' + sColor + '33;'
      + 'display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + '<span style="font-size:.70rem;font-weight:700;color:' + sColor + ';text-transform:uppercase">IP SLA</span>'
      + '<span style="font-size:.75rem;color:#CDD9E5">RTT: <b>' + nEsc(rtt) + '</b></span>'
      + (link.sla.thr ? '<span style="font-size:.70rem;color:var(--bpc-mute)">thr ' + nEsc(link.sla.thr) + ' ms</span>' : '')
      + (!sOk && !link.sla.stale ? '<span style="font-size:.70rem;color:var(--bpc-crit);font-weight:700">⚠ FAIL</span>' : '')
      + '</div>'
  }

  // ── Tráfego ──
  var traffic = ''
  if (link.inBps != null || link.outBps != null) {
    traffic = '<div style="display:flex;gap:12px;margin-top:5px">'
      + '<div style="font-size:.75rem"><span style="color:var(--bpc-mute)">↓ IN </span>'
      + '<span style="color:#CDD9E5;font-weight:600">' + nFmtBps(link.inBps) + '</span></div>'
      + '<div style="font-size:.75rem"><span style="color:var(--bpc-mute)">↑ OUT </span>'
      + '<span style="color:#CDD9E5;font-weight:600">' + nFmtBps(link.outBps) + '</span></div>'
      + '</div>'
  }

  return '<div style="background:' + bgState + ';border:1px solid ' + stateColor + '33;'
    + 'border-left:3px solid ' + stateColor + ';border-radius:7px;padding:9px 12px;'
    + 'flex:1;min-width:165px">'

    // Linha de título: dot + provider + badge UP/DOWN
    + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">'
    + nDot(link.up, link.stale, 8)
    + '<span style="font-size:.88rem;font-weight:700;color:#CDD9E5;flex:1">' + nEsc(link.name) + '</span>'
    + '<span style="font-size:.70rem;font-weight:700;color:' + stateColor + '">' + nEsc(stateLbl) + '</span>'
    + '</div>'

    // Interface name (secundário)
    + (link.found
        ? '<div style="font-size:.70rem;color:var(--bpc-mute);margin-bottom:2px" title="' + nEsc(link.desc) + '">'
          + nEsc(link.ifname) + (link.desc ? ' · ' + nEsc(link.desc.substring(0, 28)) : '') + '</div>'
        : '<div style="font-size:.70rem;color:var(--bpc-crit);font-style:italic">interface não encontrada</div>')

    + slaBadge
    + traffic

    + '</div>'
}

function nRenderGroup(grp) {
  var gcfg = grp.cfg
  var downColor = grp.downCount > 0 ? 'var(--bpc-crit)' : gcfg.color
  var groupState = grp.downCount > 0
    ? '<span style="font-size:.75rem;color:var(--bpc-crit);font-weight:700">' + grp.downCount + ' DOWN</span>'
    : '<span style="font-size:.75rem;color:var(--bpc-ok)">OK</span>'

  return '<div style="margin-bottom:16px">'
    // ── Cabeçalho do grupo ──
    + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;'
    + 'border-bottom:1px solid ' + gcfg.color + '33;padding-bottom:5px">'
    + '<span style="font-size:.78rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;'
    + 'color:' + gcfg.color + '">' + nEsc(gcfg.label) + '</span>'
    + groupState
    + '<span style="font-size:.70rem;color:var(--bpc-mute);margin-left:4px">· ' + nEsc(gcfg.note) + '</span>'
    + '</div>'
    // ── Cards dos links ──
    + '<div style="display:flex;flex-wrap:wrap;gap:6px">'
    + grp.links.map(function(l) { return nRenderLinkCard(l, gcfg.color) }).join('')
    + '</div>'
    + '</div>'
}

function nRender(el, model) {
  var headline = model.totalDown === 0
    ? '<span style="color:var(--bpc-ok)">Todos os links operacionais</span>'
    : '<span style="color:var(--bpc-crit)">' + model.totalDown + ' link(s) em baixo</span>'

  // Barra de resumo rápido por grupo
  var summary = model.groups.map(function(g) {
    var col = g.downCount > 0 ? 'var(--bpc-crit)' : g.cfg.color
    var upCount = g.links.length - g.downCount
    return '<span style="display:inline-flex;align-items:center;gap:5px;'
      + 'padding:3px 9px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid ' + col + '44">'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + col + ';display:inline-block"></span>'
      + '<span style="font-size:.78rem;color:#CDD9E5">' + nEsc(g.cfg.label) + '</span>'
      + '<span style="font-size:.75rem;color:' + col + ';font-weight:700">' + upCount + '/' + g.links.length + '</span>'
      + '</span>'
  }).join('')

  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    // ── Título + headline ──
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">'
    + '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.06em;text-transform:uppercase">Links WAN · Vista de Negócio</span>'
    + '<span style="font-size:.88rem">' + headline + '</span>'
    + '</div>'
    // ── Resumo por categoria ──
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">' + summary + '</div>'
    // ── Grupos ──
    + model.groups.map(nRenderGroup).join('')
    + '</div>'
}

function nRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Vista de Negócio WAN: ' + nEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function nLoad(rpc) {
  var el = document.getElementById(CFG_NEG.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar vista de negócio WAN…</div>'
  nFetch(rpc)
    .then(function(data) { nRender(el, nCompute(data)) })
    .catch(function(err) { nRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { nLoad(rpc) }, CFG_NEG.refreshMs)
}

function nInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(nLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-negocio: waitForBPC nunca disponivel'); return }
  setTimeout(function() { nInitWithRetry(attempt + 1) }, 100)
}

nInitWithRetry()
