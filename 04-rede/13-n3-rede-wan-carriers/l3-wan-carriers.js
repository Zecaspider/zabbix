// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · REDE · WAN CARRIERS  v1.0                              ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  Vista por carrier/operadora — agrupa circuitos dos 5 routers WAN      ║
// ║  sob a operadora que os transporta, independentemente do router.        ║
// ║                                                                          ║
// ║  Carriers: UNITEL · AT/ATELECOM · ITA · MST/Mstelecom · MULTITEL       ║
// ║            IPWORLD · CONNECTIS · Azure                                  ║
// ║                                                                          ║
// ║  Fonte de dados: net.if.status (oper-status por interface)              ║
// ║                  net.if.in / net.if.out (tráfego octets)               ║
// ║                  rttMonCtrlAdmin* (IP SLA — só WAN-INT)                ║
// ║                                                                          ║
// ║  Estrutura de um card de carrier:                                       ║
// ║    [carrier name]  [N/total UP]  [estado pior]                         ║
// ║    circuito 1 · interface · destino · UP/DOWN · RTT (se SLA)           ║
// ║    circuito 2 · …                                                       ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT   ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_CAR = {
  elementId: 'bpc-wan-carriers',
  refreshMs:  60000,
  maxAgeSec:  600,

  // Routers WAN (grupo 27) — fonte de todos os circuitos
  wanHostIds:   ['10838', '10839', '10840', '10996', '11001'],
  wanIntHostId: '10838',  // único com IP SLA

  // Carriers conhecidos: ordered by priority de detecção.
  // A detecção testa `tokens` (substrings) contra ifname+descrição.
  // O primeiro carrier que casar ganha — logo tokens mais específicos devem vir primeiro.
  carriers: [
    {
      key:    'azure',
      label:  'Azure',
      color:  '#0078D4',
      tokens: ['Po2.2931', 'Po2.2932', 'EXPRESSROUTE', 'AZURE'],
    },
    {
      key:    'ipworld',
      label:  'IPWORLD',
      color:  '#06B6D4',
      tokens: ['IPWORLD'],
    },
    {
      key:    'connectis',
      label:  'CONNECTIS',
      color:  '#8B5CF6',
      tokens: ['CONNECTIS'],
    },
    {
      key:    'multitel',
      label:  'MULTITEL',
      color:  '#F59E0B',
      tokens: ['MULTITEL'],
    },
    {
      key:    'mst',
      label:  'MST / Mstelecom',
      color:  '#10B981',
      // MST_FIBRA, MST_VSAT, MST_MW, MSTELECOM, MST-MW, MST-VSAT, Kwanza
      tokens: ['MST', 'MSTELECOM', 'MSTELCOM', 'KWANZA'],
    },
    {
      key:    'ita',
      label:  'ITA',
      color:  '#EF4444',
      tokens: ['ITA'],
    },
    {
      key:    'at',
      label:  'AT / Angola Telecom',
      color:  '#F97316',
      // ATELECOM, BGP_PEER_AT, SP_AT_* (SP_AT_S_BNA, SP_AT_S_MINFIN)
      // "AT" substring sozinho é seguro pois MULTITEL/MSTELECOM não contêm "AT"
      tokens: ['ATELECOM', 'BGP_PEER_AT', 'SP_EMIS_AT', 'SP_AT', '_AT_', ' AT '],
    },
    {
      key:    'unitel',
      label:  'UNITEL',
      color:  '#22C55E',
      tokens: ['UNITEL'],
    },
  ],

  // Mapeamento slaIdx → carrier key (só WAN-INT)
  // IP SLA 65 = ITA (auditado 2026-06-18, correlação BGP_PEER_ITA)
  slaCarrierMap: {
    '65': 'ita',
    '2':  null,   // destino não identificado (probe latência fina)
    '3':  null,
    '60': null,
    '62': null,
  },

  // Interfaces a ignorar: uplinks internos, voz, físicas sem sub-interface, gestão
  excludeRe: /^(Lo|Null|Vlan|BVI|Mgmt|nve|Vo\d|SE\d|EFXS|VoiceEncapPeer|VoiceOverIpPeer|Ethernet[0-9]\/[0-9]\/[0-9]+$|Te[0-9]\/[0-9]\/[0-9]+$|Gi0\/0\/[0-9]$|Gi0\/0\/[23456789]\.|Po1\.|Po1$|Po2$|Po11|Po12|Po13|Po200)/i,
  // Po1.x = uplinks internos (P2P Core, CUCM, CheckPoint, Rede BPC)
  // Gi0/0/[0-9]$ = interfaces físicas sem sub-interface (não são circuitos)
  // VoiceEncapPeer/VoiceOverIpPeer/EFXS/Vo0/SE = infra de voz CUBE
  excludeDescRe: /^(GERENCIA|MGMT|vrf_bpc_wifi|P2P_CORE|P2P_ChkPT|RT-to-CUCM|Rede BPC|Public_IPs_BPC|P2P_RTE|P2P_DC-IMP)/i,
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function cEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) {
    return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  })
}

function cStale(clock) {
  return !clock || (Math.floor(Date.now() / 1000) - parseInt(clock, 10)) > CFG_CAR.maxAgeSec
}

function cFmtBps(octPerSec) {
  if (octPerSec == null || isNaN(octPerSec) || octPerSec < 0) return null
  var bps = octPerSec * 8
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' Gbps'
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' Mbps'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' Kbps'
  return bps.toFixed(0) + ' bps'
}

// Extrai ifname e descrição de um item name do Zabbix
// ex: "Interface Po2.110(SP_EMIS_ATELECOM): Operational status"
function cParseIf(name) {
  var m = /Interface\s+([^(\s]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').trim() }
}

// Detecta o carrier key para um par (ifname, desc)
// Devolve a key do primeiro carrier cujo token case-insensitive aparece em ifname ou desc
function cDetectCarrier(ifname, desc) {
  var haystack = (ifname + ' ' + desc).toUpperCase()
  for (var i = 0; i < CFG_CAR.carriers.length; i++) {
    var car = CFG_CAR.carriers[i]
    for (var j = 0; j < car.tokens.length; j++) {
      if (haystack.indexOf(car.tokens[j].toUpperCase()) !== -1) {
        return car.key
      }
    }
  }
  return null  // não identificado
}

// Extrai um label legível de destino a partir da descrição
// ex: "SP_EMIS_ATELECOM" → "EMIS"
//     "DMVPN_HUB_UNITEL" → "Agências DC"
//     "BGP_PEER_ITA"     → "Internet BGP"
//     "MINFIN via UNITEL"→ "MINFIN"
function cDestLabel(ifname, desc) {
  var s = desc || ifname
  if (/BGP_PEER/i.test(s))           return 'Internet BGP'
  if (/SP_EMIS/i.test(s))            return 'EMIS'
  if (/DMVPN_HUB.*EDIFICIO/i.test(s)) return 'Agências Edif'
  if (/DMVPN_HUB/i.test(s))          return 'Agências DC'
  if (/EXPRESSROUTE|Po2\.293[12]/i.test(s + ifname)) return 'Azure ER'
  if (/MINFIN/i.test(s))             return 'MINFIN'
  if (/INSS/i.test(s))               return 'INSS'
  if (/BODIVA/i.test(s))             return 'BODIVA'
  if (/BNA/i.test(s))                return 'BNA'
  if (/MJDH/i.test(s))               return 'MJDH'
  if (/UCALL/i.test(s))              return 'UCALL'
  if (/IMPORAFRICA/i.test(s))        return 'DR (Importáfrica)'
  if (/SIP|VOIP|VOICE/i.test(s))     return 'Voz / SIP'
  if (/SMS|USSD|MONEY/i.test(s))     return 'SMS / USSD'
  if (/FW.PARC|FW-PARC|Gi0\/0\/0\.896/i.test(s + ifname)) return 'FW Parceiros'
  if (/P2P[_-]WAN[_-]HUB[_-](\w+)/i.test(s)) return 'P2P Hub'
  if (/P2P.*CORE|CORE/i.test(s))     return 'P2P Core'
  if (/Ligacao|Ligação/i.test(s))    return s.replace(/Ligacao|Ligação/i, '').trim().substring(0, 25) || 'P2P'
  if (/MSTELCOM|MST.*FIBRA/i.test(s)) return 'MST Fibra'
  if (/MST.*VSAT/i.test(s))          return 'MST VSAT'
  if (/MST.*MW/i.test(s))            return 'MST MW'
  // fallback: primeiros 30 chars da descrição ou ifname
  return s.length > 0 ? s.substring(0, 30) : ifname
}

function cDot(up, stale, sz) {
  var T = window.BPC.THEME
  var c = stale ? T.colorMute : (up ? T.colorOk : T.colorCrit)
  var pulse = !stale && !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  var s = sz || 8
  return '<span style="display:inline-block;width:'+s+'px;height:'+s+'px;border-radius:50%;'
    + 'background:'+c+';flex-shrink:0;'+pulse+'"></span>'
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function cFetch(rpc) {
  var hids = CFG_CAR.wanHostIds
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
      hostids: [CFG_CAR.wanIntHostId], filter: { status: 0 },
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

function cCompute(data) {
  // ── IP SLA index: slaIdx → { sense, rttMs, stale } ──
  var slaIdx = {}
  data.ipsla.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_)
    if (!m) return
    var field = m[1], idx = m[2]
    if (!slaIdx[idx]) slaIdx[idx] = {}
    slaIdx[idx][field] = { val: it.lastvalue, stale: cStale(it.lastclock) }
  })

  // ── Tráfego index: hostid+ifname → { inBps, outBps } ──
  var trafficIdx = {}
  function indexTraffic(items, field) {
    items.forEach(function(it) {
      var p = cParseIf(it.name)
      if (!p) return
      var k = it.hostid + '|' + p.ifname
      if (!trafficIdx[k]) trafficIdx[k] = {}
      trafficIdx[k][field] = cStale(it.lastclock) ? null : parseFloat(it.lastvalue)
    })
  }
  indexTraffic(data.ifIn,  'inBps')
  indexTraffic(data.ifOut, 'outBps')

  // ── Construir circuitos agrupados por carrier ──
  // carrierMap: key → { cfg, circuits[] }
  var carrierMap = {}
  CFG_CAR.carriers.forEach(function(c) { carrierMap[c.key] = { cfg: c, circuits: [] } })
  var unknown = { cfg: { key: 'unknown', label: 'Não identificado', color: '#64748B' }, circuits: [] }

  data.ifStatus.forEach(function(it) {
    var p = cParseIf(it.name)
    if (!p || !p.ifname) return

    // Excluir uplinks internos, interfaces de gestão e infra de voz
    if (CFG_CAR.excludeRe.test(p.ifname)) return
    if (p.desc && CFG_CAR.excludeDescRe.test(p.desc)) return

    var carKey = cDetectCarrier(p.ifname, p.desc)
    var dest    = cDestLabel(p.ifname, p.desc)
    var up      = it.lastvalue === '1'
    var stale   = cStale(it.lastclock)
    var tk      = it.hostid + '|' + p.ifname
    var traffic = trafficIdx[tk] || {}

    // IP SLA: procurar se existe um probe mapeado a este carrier neste hostid
    var sla = null
    if (it.hostid === CFG_CAR.wanIntHostId) {
      Object.keys(CFG_CAR.slaCarrierMap).forEach(function(idx) {
        if (CFG_CAR.slaCarrierMap[idx] !== carKey) return
        if (!slaIdx[idx]) return
        var sd = slaIdx[idx]
        // validar que o probe pertence a este circuito (BGP_PEER_ITA ↔ sla 65)
        if (sd['Sense']) {
          sla = {
            sense: sd['Sense'].val,
            rttMs: sd['CompletionTime'] ? sd['CompletionTime'].val : null,
            thr:   sd['Threshold']      ? sd['Threshold'].val      : null,
            stale: sd['Sense'].stale,
          }
        }
      })
    }

    var circuit = {
      ifname:  p.ifname,
      desc:    p.desc,
      dest:    dest,
      hostid:  it.hostid,
      up:      up,
      stale:   stale,
      // estado efectivo: se SLA existe e falha, o circuito está degradado mesmo com if UP
      effDown: !up || (sla && !sla.stale && sla.sense !== '1'),
      inBps:   traffic.inBps  != null ? traffic.inBps  : null,
      outBps:  traffic.outBps != null ? traffic.outBps : null,
      sla:     sla,
    }

    if (carKey && carrierMap[carKey]) {
      carrierMap[carKey].circuits.push(circuit)
    } else {
      unknown.circuits.push(circuit)
    }
  })

  // ── Ordenar circuitos dentro de cada carrier: DOWN primeiro, depois por dest ──
  function sortCircuits(circuits) {
    return circuits.sort(function(a, b) {
      if (a.effDown !== b.effDown) return a.effDown ? -1 : 1
      return a.dest < b.dest ? -1 : 1
    })
  }

  var groups = CFG_CAR.carriers
    .map(function(c) { return carrierMap[c.key] })
    .filter(function(g) { return g.circuits.length > 0 })
    .map(function(g) {
      g.circuits = sortCircuits(g.circuits)
      g.downCount = g.circuits.filter(function(c) { return c.effDown }).length
      return g
    })

  if (unknown.circuits.length > 0) {
    unknown.circuits = sortCircuits(unknown.circuits)
    unknown.downCount = unknown.circuits.filter(function(c) { return c.effDown }).length
    groups.push(unknown)
  }

  var totalCircuits = groups.reduce(function(a, g) { return a + g.circuits.length }, 0)
  var totalDown     = groups.reduce(function(a, g) { return a + g.downCount }, 0)
  return { groups: groups, totalCircuits: totalCircuits, totalDown: totalDown }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function cRenderCircuitRow(c, carrierColor) {
  var T = window.BPC.THEME
  var stateColor = c.stale ? T.colorMute : (c.effDown ? T.colorCrit : T.colorOk)
  var stateLbl   = c.stale ? '?' : (c.effDown ? 'DOWN' : 'UP')

  // IP SLA badge (inline na linha)
  var slaBadge = ''
  if (c.sla) {
    var sOk = !c.sla.stale && c.sla.sense === '1'
    var sc  = c.sla.stale ? T.colorMute : (sOk ? T.colorOk : T.colorCrit)
    slaBadge = '<span style="font-size:.72rem;color:' + sc + ';font-weight:700;margin-left:6px">'
      + 'SLA ' + (sOk ? 'OK' : '⚠ FAIL')
      + (c.sla.rttMs != null ? ' · ' + c.sla.rttMs + ' ms' : '')
      + '</span>'
  }

  // Tráfego
  var trafficStr = ''
  if (c.inBps != null || c.outBps != null) {
    trafficStr = '<span style="font-size:.72rem;color:var(--bpc-mute);margin-left:8px">'
      + '↓ ' + (cFmtBps(c.inBps) || '—')
      + ' ↑ ' + (cFmtBps(c.outBps) || '—')
      + '</span>'
  }

  return '<div style="display:flex;align-items:center;gap:6px;padding:4px 0;'
    + 'border-top:1px solid rgba(255,255,255,0.04);flex-wrap:wrap">'
    + cDot(c.up, c.stale, 7)
    // destino (negrito)
    + '<span style="font-size:.83rem;font-weight:600;color:#CDD9E5;min-width:120px">' + cEsc(c.dest) + '</span>'
    // interface name (subtil)
    + '<span style="font-size:.73rem;color:var(--bpc-mute)">' + cEsc(c.ifname) + '</span>'
    // estado
    + '<span style="font-size:.75rem;font-weight:700;color:' + stateColor + ';margin-left:auto">' + stateLbl + '</span>'
    + slaBadge
    + trafficStr
    + '</div>'
}

function cRenderCarrierCard(grp) {
  var cfg = grp.cfg
  var upCount = grp.circuits.length - grp.downCount
  var stateColor = grp.downCount > 0 ? 'var(--bpc-crit)' : cfg.color
  var stateLbl   = grp.downCount > 0
    ? grp.downCount + ' DOWN'
    : upCount + '/' + grp.circuits.length + ' UP'

  return '<div style="background:rgba(14,20,60,0.50);border:1px solid rgba(255,255,255,0.07);'
    + 'border-left:4px solid ' + cfg.color + ';border-radius:8px;padding:12px 16px;'
    + 'margin-bottom:10px">'

    // ── Cabeçalho do carrier ──
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;flex-wrap:wrap">'
    + '<span style="font-size:1.0rem;font-weight:800;letter-spacing:.04em;color:' + cfg.color + '">'
    + cEsc(cfg.label) + '</span>'
    + '<span style="font-size:.78rem;font-weight:700;color:' + stateColor + '">' + cEsc(stateLbl) + '</span>'
    + '<span style="font-size:.75rem;color:var(--bpc-mute);margin-left:auto">'
    + grp.circuits.length + ' circuito' + (grp.circuits.length !== 1 ? 's' : '') + '</span>'
    + '</div>'

    // ── Circuitos ──
    + grp.circuits.map(function(c) { return cRenderCircuitRow(c, cfg.color) }).join('')

    + '</div>'
}

function cRender(el, model) {
  var headline = model.totalDown === 0
    ? '<span style="color:var(--bpc-ok)">Todos os carriers operacionais</span>'
    : '<span style="color:var(--bpc-crit)">' + model.totalDown + ' circuito(s) em baixo</span>'

  // Barra de resumo rápido
  var summary = model.groups.map(function(g) {
    var col = g.downCount > 0 ? 'var(--bpc-crit)' : g.cfg.color
    return '<span style="display:inline-flex;align-items:center;gap:5px;padding:3px 9px;'
      + 'border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid ' + col + '44">'
      + '<span style="width:7px;height:7px;border-radius:50%;background:' + col + ';display:inline-block"></span>'
      + '<span style="font-size:.78rem;color:#CDD9E5">' + cEsc(g.cfg.label) + '</span>'
      + '<span style="font-size:.75rem;color:' + col + ';font-weight:700">'
      + (g.circuits.length - g.downCount) + '/' + g.circuits.length + '</span>'
      + '</span>'
  }).join('')

  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap">'
    + '<span style="font-size:1.0rem;font-weight:700;color:#CDD9E5;letter-spacing:.06em;text-transform:uppercase">WAN · Por Carrier</span>'
    + '<span style="font-size:.88rem">' + headline + '</span>'
    + '<span style="margin-left:auto;font-size:.75rem;color:var(--bpc-mute)">'
    + model.totalCircuits + ' circuitos · ' + model.groups.length + ' carriers'
    + '</span>'
    + '</div>'
    + '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px">' + summary + '</div>'
    + model.groups.map(cRenderCarrierCard).join('')
    + '</div>'
}

function cRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ WAN Carriers: ' + cEsc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function cLoad(rpc) {
  var el = document.getElementById(CFG_CAR.elementId)
  if (!el) return
  el.innerHTML = '<div style="padding:12px;color:var(--bpc-mute);font-size:.85rem">A carregar carriers WAN…</div>'
  cFetch(rpc)
    .then(function(data) { cRender(el, cCompute(data)) })
    .catch(function(err) { cRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { cLoad(rpc) }, CFG_CAR.refreshMs)
}

function cInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(cLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-carriers: waitForBPC nunca disponivel'); return }
  setTimeout(function() { cInitWithRetry(attempt + 1) }, 100)
}

cInitWithRetry()
