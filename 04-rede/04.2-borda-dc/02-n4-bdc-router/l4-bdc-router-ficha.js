// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N4 · REDE · BORDA DC · ROUTER — FICHA TÉCNICA  v1.0           ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                             ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                  ║
// ║                                                                          ║
// ║  Variável Grafana "routerName" (Custom, hostname como value).           ║
// ║  Painel resolve hostname → hostid via host.get.                        ║
// ║                                                                          ║
// ║  Rebuild 2026-07-01 — categorias corrigidas face ao mapeamento real     ║
// ║  (item.get ao vivo): WAN-AG separa Agências/Edifícios/Azure em vez de   ║
// ║  os misturar; GTW01 é "Governo" (MINFIN/INSS/BODIVA), nunca Azure;      ║
// ║  PARC separa "Parceiros" de "Voz/Telefonia" (dois domínios técnicos).   ║
// ║  Alertas activos: painel nativo à parte (n4-bdc-triggers.json), não     ║
// ║  reconstruído aqui em Business Text.                                    ║
// ║                                                                          ║
// ║  [1] CFG  [2] HELPERS  [3] FETCH  [4] COMPUTE  [5] RENDER  [6] BOOT     ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_R4 = {
  elementId:       'bpc-n4-bdc-router',
  refreshMs:        60000,
  // 2400s (40min): o proxy zabbix-api usado por BPC.rpc faz cache no
  // servidor por ~30min (confirmado ao vivo) — um limiar de "stale" mais
  // curto do que isso assinala falso-positivo em dados genuinamente ao
  // vivo só porque estão dentro da janela de cache. Ver
  // documentacao/metodologia-auditoria-topologia.md.
  maxAgeSec:        2400,
  defaultHostname: 'DC1-RTE-WAN-INT',
  n3DashUid:       'rede-n3-bdc-routers',

  routers: {
    'DC1-RTE-WAN-INT':  { funcao: 'Internet', modelo: 'ISR4451',     hasSla: true  },
    'DC1-RTE-WAN-EMIS': { funcao: 'EMIS',     modelo: 'ISR4451',     hasSla: false },
    'DC1-RTE-WAN-AG':   { funcao: 'Agências / Edifícios / Azure', modelo: 'C8500L-8S4X', hasSla: false },
    'DC1-RTE-GTW01':    { funcao: 'Governo',  modelo: 'C8200',       hasSla: false },
    'DC1-RTE-PARC':     { funcao: 'Parceiros / Voz', modelo: 'ISR4451', hasSla: false },
  },

  // Categorias por router — só as que fazem sentido para cada um (visibleCats).
  // Regex testado só contra ifname (não concatenar com desc — lição do N3).
  ifCategories: [
    { key: 'bgp',              label: 'BGP Peers',            match: function(n) { return /^Po2\.(65|960|1576)$/i.test(n) } },
    { key: 'emis',             label: 'Circuitos EMIS',       match: function(n) { return /^Po2\.(110|835|1158)$/i.test(n) } },
    { key: 'dmvpn-agencias',   label: 'Túneis DMVPN Agências',  match: function(n) { return /^Tu10[1-7]$/i.test(n) } },
    { key: 'dmvpn-edificios',  label: 'Túneis DMVPN Edifícios', match: function(n) { return /^Tu20[1-8]$/i.test(n) } },
    { key: 'azure',            label: 'Azure ExpressRoute',   match: function(n) { return /^Po2\.293[12]$/i.test(n) } },
    { key: 'governo',          label: 'Circuitos institucionais', match: function(n) { return /^(Tu20|Tu30|Tu603)$/i.test(n) || /^Gi0\/0\/1\.802$/i.test(n) } },
    { key: 'parceiros',        label: 'Circuitos de parceiros',  match: function(n) { return /^Po2\.\d+$/i.test(n) } },
    { key: 'voz',              label: 'Troncos de voz',       match: function(n) { return /^VoiceOverIpPeer/i.test(n) } },
  ],

  visibleCats: {
    'DC1-RTE-WAN-INT':  ['bgp'],
    'DC1-RTE-WAN-EMIS': ['emis'],
    'DC1-RTE-WAN-AG':   ['dmvpn-agencias', 'dmvpn-edificios', 'azure'],
    'DC1-RTE-GTW01':    ['governo'],
    'DC1-RTE-PARC':     ['parceiros', 'voz'],
  },

  slaLabels: { '2': 'Probe 2', '3': 'Probe 3', '60': 'Probe 60', '62': 'Probe 62', '65': 'ITA Internet' },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] HELPERS
// ────────────────────────────────────────────────────────────────────────────

function r4Esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] }) }
function r4Stale(c) { return !c || (Math.floor(Date.now() / 1000) - parseInt(c, 10)) > CFG_R4.maxAgeSec }

function r4FmtBps(o) {
  if (o == null || isNaN(o) || o < 0) return null
  var b = o * 8
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' Gbps'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' Mbps'
  if (b >= 1e3) return (b / 1e3).toFixed(0) + ' Kbps'
  return b.toFixed(0) + ' bps'
}

function r4FmtUp(s) {
  if (!s) return '—'
  var v = parseInt(s, 10), d = Math.floor(v / 86400), h = Math.floor((v % 86400) / 3600), m = Math.floor((v % 3600) / 60)
  return d > 0 ? d + 'd ' + h + 'h' : h > 0 ? h + 'h ' + m + 'm' : m + 'm'
}

function r4ParseIf(name) {
  var m = /^Interface\s+([^(\s:]+)(?:\(([^)]*)\))?/.exec(name || '')
  if (!m) return null
  return { ifname: m[1].trim(), desc: (m[2] || '').replace(/^\*+|\*+$/g, '').trim() }
}

function r4Dot(up, stale) {
  var T = window.BPC.THEME
  var c = stale ? '#8891A8' : (up ? '#22C55E' : '#f85149')
  var pulse = !stale && !up ? 'animation:bpc-pulse-pill 1.2s ease-in-out infinite;' : ''
  return '<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:' + c + ';flex-shrink:0;' + pulse + '"></span>'
}

function r4GetHostname() {
  try {
    var p = new URLSearchParams(window.location.search).get('var-routerName')
    if (p && CFG_R4.routers[p.trim()]) return p.trim()
  } catch (e) {}
  return CFG_R4.defaultHostname
}

function r4Classify(ifname) {
  for (var i = 0; i < CFG_R4.ifCategories.length; i++) { if (CFG_R4.ifCategories[i].match(ifname)) return CFG_R4.ifCategories[i].key }
  return null
}


// ────────────────────────────────────────────────────────────────────────────
// [3] FETCH
// ────────────────────────────────────────────────────────────────────────────

function r4ResolveHostId(rpc, hostname) {
  return rpc('host.get', { filter: { host: [hostname] }, output: ['hostid', 'host'], limit: 1 })
    .then(function(r) { if (!r || !r.length) throw new Error('Router não encontrado: ' + hostname); return r[0].hostid })
}

function r4Fetch(rpc, hostId, rtr) {
  var calls = [
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { key_: 'net.if.status' }, output: ['name', 'key_', 'lastvalue', 'lastclock'] }),
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { name: 'Bits received' }, output: ['name', 'key_', 'lastvalue', 'lastclock'] }),
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { name: 'Bits sent' },     output: ['name', 'key_', 'lastvalue', 'lastclock'] }),
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { key_: 'system.cpu.util' }, output: ['name', 'key_', 'lastvalue', 'lastclock'], limit: 3 }),
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { name: 'Processor: Memory utilization' }, output: ['name', 'key_', 'lastvalue', 'lastclock'] }),
    rpc('item.get', { hostids: [hostId], search: { name: 'uptime' }, searchWildcardsEnabled: true, output: ['name', 'key_', 'lastvalue', 'lastclock'], limit: 1 }),
    rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { key_: 'icmpping' }, output: ['name', 'key_', 'lastvalue', 'lastclock'] }),
  ]
  if (rtr.hasSla) calls.push(rpc('item.get', { hostids: [hostId], filter: { status: 0 }, search: { key_: 'rttMonCtrlAdmin' }, output: ['name', 'key_', 'lastvalue', 'lastclock'] }))
  return Promise.all(calls).then(function(r) {
    return { ifStatus: r[0], ifIn: r[1], ifOut: r[2], cpu: r[3], ram: r[4], uptime: r[5], icmp: r[6], sla: r[7] || [] }
  })
}


// ────────────────────────────────────────────────────────────────────────────
// [4] COMPUTE
// ────────────────────────────────────────────────────────────────────────────

function r4Compute(data) {
  // "Processor: Memory utilization" — excluir a variante "reserve Processor: ..."
  // (mesmo template Cisco expõe 2 pools; só o principal interessa aqui).
  var ramItem = data.ram.filter(function(it) { return it.name === 'Processor: Memory utilization' })[0]

  var sys = {
    cpu:    data.cpu.length ? parseFloat(data.cpu[0].lastvalue) : null,
    ram:    ramItem ? parseFloat(ramItem.lastvalue) : null,
    uptime: data.uptime.length ? data.uptime[0].lastvalue             : null,
    icmp:   data.icmp.length   ? data.icmp[0].lastvalue === '1'       : null,
  }

  var trIdx = {}
  function idxTr(items, field) {
    items.forEach(function(it) {
      var m = /^Interface\s+([^(\s:]+)/.exec(it.name || ''); if (!m) return
      var k = m[1].trim(); if (!trIdx[k]) trIdx[k] = {}
      trIdx[k][field] = r4Stale(it.lastclock) ? null : parseFloat(it.lastvalue)
    })
  }
  idxTr(data.ifIn, 'inBps'); idxTr(data.ifOut, 'outBps')

  var cats = {}
  CFG_R4.ifCategories.forEach(function(c) { cats[c.key] = [] })
  data.ifStatus.forEach(function(it) {
    var p = r4ParseIf(it.name); if (!p) return
    var cat = r4Classify(p.ifname); if (!cat) return
    var up = it.lastvalue === '1'
    var stale = r4Stale(it.lastclock), tr = trIdx[p.ifname] || {}
    cats[cat].push({ ifname: p.ifname, desc: p.desc, up: up, stale: stale, inBps: tr.inBps != null ? tr.inBps : null, outBps: tr.outBps != null ? tr.outBps : null })
  })
  Object.keys(cats).forEach(function(k) {
    cats[k].sort(function(a, b) { if (!a.stale && !b.stale && a.up !== b.up) return a.up ? 1 : -1; return a.ifname < b.ifname ? -1 : 1 })
  })

  var slaProbes = {}
  data.sla.forEach(function(it) {
    var m = /rttMonCtrlAdmin(\w+)\[(\d+)\]/.exec(it.key_); if (!m) return
    var field = m[1], idx = m[2]; if (!slaProbes[idx]) slaProbes[idx] = {}
    slaProbes[idx][field] = { val: it.lastvalue, stale: r4Stale(it.lastclock) }
  })

  var totalDown = 0, totalCircuits = 0
  Object.keys(cats).forEach(function(k) {
    totalCircuits += cats[k].length
    totalDown += cats[k].filter(function(i) { return !i.stale && !i.up }).length
  })

  return { sys: sys, cats: cats, slaProbes: slaProbes, totalDown: totalDown, totalCircuits: totalCircuits }
}


// ────────────────────────────────────────────────────────────────────────────
// [5] RENDER
// ────────────────────────────────────────────────────────────────────────────

function r4RenderHeader(hostname, hostId, rtr, model) {
  var s = model.sys
  var icmpCol = s.icmp == null ? '#8891A8' : (s.icmp ? '#22C55E' : '#f85149')
  var cpuCol  = s.cpu == null ? '#8891A8' : s.cpu > 85 ? '#f85149' : s.cpu > 70 ? '#d29922' : '#22C55E'
  var ramCol  = s.ram == null ? '#8891A8' : s.ram > 90 ? '#f85149' : s.ram > 80 ? '#d29922' : '#22C55E'

  function kpi(label, val, color, unit) {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;'
      + 'padding:10px 22px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid ' + color + '33;min-width:90px">'
      + '<span style="font-size:24px;font-weight:700;color:' + color + '">' + (val != null ? r4Esc(String(val)) : '—') + (val != null && unit ? '<span style="font-size:14px;color:#8891A8">' + unit + '</span>' : '') + '</span>'
      + '<span style="font-size:12px;color:#8891A8;text-transform:uppercase;letter-spacing:.05em;margin-top:2px">' + label + '</span>'
      + '</div>'
  }

  return '<div style="background:rgba(14,20,60,0.6);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px 20px;margin-bottom:12px">'
    + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:2px">'
    +   r4Dot(s.icmp, s.icmp == null)
    +   '<span style="font-size:22px;font-weight:700;color:#E6EDF3">' + r4Esc(hostname) + '</span>'
    +   '<span style="font-size:15px;color:#8891A8">— ' + r4Esc(rtr.funcao) + '</span>'
    + '</div>'
    + '<div style="font-size:13px;color:#8891A8;font-family:monospace;margin-bottom:12px">' + r4Esc(rtr.modelo) + ' · hostid ' + r4Esc(hostId) + '</div>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap">'
    +   kpi('ICMP', s.icmp == null ? null : (s.icmp ? 'UP' : 'DOWN'), icmpCol, '')
    +   kpi('CPU', s.cpu != null ? s.cpu.toFixed(1) : null, cpuCol, '%')
    +   kpi('RAM', s.ram != null ? s.ram.toFixed(1) : null, ramCol, '%')
    +   kpi('Uptime', r4FmtUp(s.uptime), '#8891A8', '')
    +   kpi('Circuitos', model.totalCircuits, model.totalDown > 0 ? '#f85149' : '#22C55E', (model.totalDown > 0 ? ' (' + model.totalDown + ' down)' : ''))
    + '</div>'
    + '</div>'
}

function r4RenderIfRow(i) {
  var col = i.stale ? '#8891A8' : (i.up ? '#22C55E' : '#f85149')
  var lbl = i.stale ? '?' : (i.up ? 'UP' : 'DOWN')
  var bg  = !i.stale && !i.up ? 'background:rgba(248,81,73,0.08);' : ''
  var inS = r4FmtBps(i.inBps), outS = r4FmtBps(i.outBps)
  var trStr = (inS || outS) ? '↓ ' + (inS || '—') + '  ↑ ' + (outS || '—') : ''
  return '<div style="' + bg + 'display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap">'
    + r4Dot(i.up, i.stale)
    + '<span style="font-size:15px;font-weight:600;color:#E6EDF3;min-width:70px;flex-shrink:0">' + r4Esc(i.ifname) + '</span>'
    + '<span style="font-size:14px;color:#B8C0D4;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + r4Esc(i.desc) + '">' + r4Esc(i.desc || '—') + '</span>'
    + '<span style="font-size:14px;font-weight:700;color:' + col + ';white-space:nowrap">' + lbl + '</span>'
    + (trStr ? '<span style="font-size:13px;color:#8891A8;white-space:nowrap">' + r4Esc(trStr) + '</span>' : '')
    + '</div>'
}

function r4RenderCircuits(hostname, rtr, model) {
  var visible = CFG_R4.visibleCats[hostname] || []
  var catMeta = {}; CFG_R4.ifCategories.forEach(function(c) { catMeta[c.key] = c })

  var html = ''
  visible.forEach(function(key) {
    var ifs = model.cats[key] || []
    var meta = catMeta[key] || { label: key }
    var down = ifs.filter(function(i) { return !i.stale && !i.up }).length
    var titleColor = down > 0 ? '#f85149' : '#22C55E'

    var slaHtml = ''
    if (key === 'bgp' && rtr.hasSla) {
      var rows = Object.keys(CFG_R4.slaLabels).map(function(idx) {
        var p = model.slaProbes[idx] || {}, sense = p['Sense'], rtt = p['CompletionTime']
        var ok = sense && !sense.stale && sense.val === '1', stale = !sense || sense.stale
        var sc = stale ? '#8891A8' : (ok ? '#22C55E' : '#f85149')
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid rgba(255,255,255,0.05)">'
          + r4Dot(!stale && ok, stale)
          + '<span style="font-size:14px;font-weight:600;color:#E6EDF3;min-width:70px">SLA ' + r4Esc(idx) + '</span>'
          + '<span style="font-size:13px;color:#8891A8;flex:1">' + r4Esc(CFG_R4.slaLabels[idx] || '') + '</span>'
          + '<span style="font-size:14px;font-weight:700;color:' + sc + '">' + (stale ? '?' : (ok ? 'OK' : 'FAIL')) + '</span>'
          + (rtt && !rtt.stale ? '<span style="font-size:13px;color:#B8C0D4;font-weight:600">' + r4Esc(rtt.val) + ' ms</span>' : '')
          + '</div>'
      }).join('')
      slaHtml = '<div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.08)">'
        + '<div style="padding:6px 10px;background:rgba(255,255,255,0.02)"><span style="font-size:12px;font-weight:700;color:#8891A8;text-transform:uppercase;letter-spacing:.06em">IP SLA</span></div>'
        + rows + '</div>'
    }

    html += '<div style="margin-bottom:14px;border:1px solid rgba(255,255,255,0.08);border-radius:8px;overflow:hidden">'
      + '<div style="padding:8px 12px;background:rgba(255,255,255,0.03);border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;align-items:center">'
      +   '<span style="font-size:15px;font-weight:700;color:#E6EDF3">' + r4Esc(meta.label) + '</span>'
      +   '<span style="font-size:15px;font-weight:700;color:' + titleColor + '">' + (ifs.length - down) + '/' + ifs.length + ' UP</span>'
      + '</div>'
      + (ifs.length
          ? (ifs.length > 8
              ? '<div style="max-height:340px;overflow-y:auto">' + ifs.map(r4RenderIfRow).join('') + '</div>'
              : ifs.map(r4RenderIfRow).join(''))
          : '<div style="padding:10px;font-size:14px;color:#8891A8">Sem circuitos identificados</div>')
      + slaHtml
      + '</div>'
  })
  return html
}

function r4Render(el, hostname, hostId, rtr, model) {
  el.innerHTML = '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif;padding:2px 0">'
    + r4RenderHeader(hostname, hostId, rtr, model)
    + r4RenderCircuits(hostname, rtr, model)
    + '</div>'
}

function r4RenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down"><div class="bpc-error-msg">⚠ Ficha Router Borda DC: ' + r4Esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [6] BOOT
// ────────────────────────────────────────────────────────────────────────────

function r4Load(rpc) {
  var el = document.getElementById(CFG_R4.elementId); if (!el) return
  var hostname = r4GetHostname(), rtr = CFG_R4.routers[hostname]
  if (!rtr) { r4RenderError(el, 'Router não reconhecido: ' + hostname); return }
  el.innerHTML = '<div style="padding:12px;color:#8891A8;font-size:15px">A carregar ' + r4Esc(hostname) + '…</div>'
  r4ResolveHostId(rpc, hostname)
    .then(function(hostId) { return r4Fetch(rpc, hostId, rtr).then(function(data) { r4Render(el, hostname, hostId, rtr, r4Compute(data)) }) })
    .catch(function(err) { r4RenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { r4Load(rpc) }, CFG_R4.refreshMs)
}

function r4InitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(r4Load); return }
  if (attempt > 50) { console.error('[BPC] l4-bdc-router-ficha: waitForBPC nunca disponivel'); return }
  setTimeout(function() { r4InitWithRetry(attempt + 1) }, 100)
}

r4InitWithRetry()
