// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · DC — FABRIC · KPI STRIP  v1.0                          ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 tiles:                                                                ║
// ║    1. Switches (8 total)                                                ║
// ║    2. Switches UP (ICMP)                                                ║
// ║    3. PortChannels UP / total (Po* com lastvalue=1)                     ║
// ║    4. Interfaces DOWN (net.if.status = 2)                               ║
// ║    5. Alertas activos (trigger.get grupos 26+22)                        ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] RENDER  [4] BOOT                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_DCKPI = {
  elementId: 'bpc-n3dc-kpi',
  refreshMs:  60000,

  // grupo 26 = HG_DC_SWITCHES · grupo 22 = Switchs Gestão (DC-IMP-SWA-EDGE)
  groupIds: ['26', '22'],

  // todos os hostids do fabric DC
  hosts: [
    { hostid: '10847', label: 'SPINE-11' },
    { hostid: '10848', label: 'SPINE-12' },
    { hostid: '10843', label: 'LEAF-101' },
    { hostid: '10845', label: 'LEAF-102' },
    { hostid: '10842', label: 'LEAF-103' },
    { hostid: '10846', label: 'LEAF-104' },
    { hostid: '10844', label: 'LEAF-105' },
    { hostid: '10667', label: 'SWA-EDGE' },
  ],

  trigPriority: { crit: [4, 5], warn: [2, 3] },
}


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function dckpiFetch(rpc) {
  var hids = CFG_DCKPI.hosts.map(function(h) { return h.hostid })
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      filter:  { status: 0, key_: 'icmpping' },
      output:  ['hostid', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hids,
      search:  { key_: 'net.if.status' },
      filter:  { status: 0 },
      output:  ['hostid', 'name', 'lastvalue'],
    }),
    rpc('trigger.get', {
      groupids:  CFG_DCKPI.groupIds,
      filter:    { value: 1 },
      output:    ['priority'],
      monitored: true,
      only_true: true,
    }),
  ]).then(function(r) { return { icmp: r[0], ifaces: r[1], trigs: r[2] } })
}


// ────────────────────────────────────────────────────────────────────────────
// [3] RENDER
// ────────────────────────────────────────────────────────────────────────────

function dckpiTile(opts) {
  var state  = opts.state || 'ok'
  var accent = window.BPC.state.color(state)
  var cardSt = (state === 'crit' || state === 'down') ? 'down' : state
  var sub    = opts.sub
    ? '<div style="font-size:.88rem;color:var(--bpc-mute);margin-top:auto">' + opts.sub + '</div>'
    : ''
  return '<div class="bpc bpc-card state-' + cardSt + '"'
    + ' style="--card-accent:' + accent + ';height:100%;display:flex;flex-direction:column;gap:6px">'
    + '<div class="bpc-label">' + window.BPC_SHARED.esc(opts.label) + '</div>'
    + '<div class="bpc-flex" style="align-items:baseline;gap:6px">'
    +   '<span class="bpc-value-lg" style="color:' + (opts.valueColor || '#E6EDF3') + '">' + opts.value + '</span>'
    +   (opts.unit ? '<span class="bpc-value-sm bpc-mute">' + opts.unit + '</span>' : '')
    + '</div>'
    + sub
    + '</div>'
}

function dckpiRender(el, data) {
  var hids  = CFG_DCKPI.hosts.map(function(h) { return h.hostid })
  var total = hids.length

  // ICMP por host
  var icmpUp = {}
  data.icmp.forEach(function(i) { icmpUp[i.hostid] = i.lastvalue === '1' })
  var upCount   = hids.filter(function(id) { return icmpUp[id] === true  }).length
  var downCount = hids.filter(function(id) { return icmpUp[id] === false }).length

  // PortChannels e interfaces DOWN
  var poUp = 0, poTotal = 0, ifDown = 0
  data.ifaces.forEach(function(it) {
    // interface name: "Interface Po1(...): Operational status"
    var m = /^Interface\s+(Po\S*)/.exec(it.name || '')
    if (m) {
      poTotal++
      if (it.lastvalue === '1') poUp++
    }
    if (it.lastvalue === '2') ifDown++
  })

  // Alertas
  var crit = 0, warn = 0
  data.trigs.forEach(function(t) {
    var p = parseInt(t.priority, 10)
    if (CFG_DCKPI.trigPriority.crit.indexOf(p) !== -1) crit++
    else if (CFG_DCKPI.trigPriority.warn.indexOf(p) !== -1) warn++
  })

  var swSt   = downCount > 0 ? 'down' : 'ok'
  var upSt   = upCount < total ? (downCount > 0 ? 'crit' : 'warn') : 'ok'
  var poSt   = poUp < poTotal ? 'warn' : 'ok'
  var ifSt   = ifDown > 0 ? 'warn' : 'ok'
  var alrtSt = crit > 0 ? 'crit' : warn > 0 ? 'warn' : 'ok'

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + dckpiTile({ label: 'Switches', value: total, unit: 'total', state: swSt,
        sub: '7 DC · 1 OOB gestão' })
    + dckpiTile({ label: 'Switches UP', value: upCount, unit: '/ ' + total, state: upSt,
        valueColor: upSt === 'ok' ? window.BPC.state.color('ok') : '#E6EDF3',
        sub: 'ICMP · ' + downCount + ' DOWN' })
    + dckpiTile({ label: 'PortChannels', value: poUp + ' / ' + poTotal, unit: 'UP',
        state: poSt,
        valueColor: poSt === 'ok' ? window.BPC.state.color('ok') : window.BPC.state.color('warn'),
        sub: 'interfaces Po* activas' })
    + dckpiTile({ label: 'Interfaces DOWN', value: ifDown, unit: ifDown === 1 ? 'link' : 'links',
        state: ifSt,
        valueColor: ifDown > 0 ? window.BPC.state.color('warn') : '#E6EDF3',
        sub: 'net.if.status = 2 · todos switches' })
    + dckpiTile({ label: 'Alertas activos', value: crit + warn, unit: 'alertas',
        state: alrtSt,
        valueColor: (crit + warn) > 0 ? window.BPC.state.color(alrtSt) : '#E6EDF3',
        sub: crit + ' crítico · ' + warn + ' aviso' })
    + '</div>'
}

function dckpiRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ KPI DC: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [4] BOOT
// ────────────────────────────────────────────────────────────────────────────

function dckpiLoad(rpc) {
  var el = document.getElementById(CFG_DCKPI.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function() { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  dckpiFetch(rpc)
    .then(function(data) { dckpiRender(el, data) })
    .catch(function(err)  { dckpiRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { dckpiLoad(rpc) }, CFG_DCKPI.refreshMs)
}

function dckpiInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(dckpiLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-dc-kpi: waitForBPC nunca disponivel'); return }
  setTimeout(function() { dckpiInitWithRetry(attempt + 1) }, 100)
}

dckpiInitWithRetry()
