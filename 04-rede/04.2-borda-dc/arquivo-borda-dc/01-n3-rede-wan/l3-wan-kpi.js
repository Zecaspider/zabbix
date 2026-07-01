// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  BPC NOC — N3 · WAN — SERVIÇOS · KPI STRIP  v1.0                       ║
// ║  Framework: BPC-UI v9 · waitForBPC bootstrap                           ║
// ║  Datasource: BPC-NETWORK (ffo8sp8zllog0e) · Zabbix 7.0                ║
// ║                                                                          ║
// ║  5 tiles:                                                                ║
// ║    1. Routers WAN (5 total)                                             ║
// ║    2. Serviços UP (ICMP up + sem circuitos down)                        ║
// ║    3. Degradado/DOWN (circuitos down ou ICMP fail)                      ║
// ║    4. Circuitos total (interfaces nomeadas de g27)                      ║
// ║    5. Alertas activos (trigger.get grupo 27)                            ║
// ║                                                                          ║
// ║  [1] CFG  [2] FETCH  [3] RENDER  [4] BOOT                              ║
// ╚══════════════════════════════════════════════════════════════════════════╝


// ────────────────────────────────────────────────────────────────────────────
// [1] CFG
// ────────────────────────────────────────────────────────────────────────────

var CFG_WKPI = {
  elementId: 'bpc-n3wan-kpi',
  refreshMs:  60000,

  wanHosts: [
    { hostid: '10838', name: 'Internet'  },
    { hostid: '10839', name: 'EMIS'      },
    { hostid: '10996', name: 'Agências'  },
    { hostid: '11001', name: 'Parceiros' },
    { hostid: '10840', name: 'Azure/Gov' },
  ],

  trigPriority: { crit: [4, 5], warn: [2, 3] },
}

var WKPI_NAMED_IF = /\(([^)]+)\)/  // interface nomeada pela equipa de rede


// ────────────────────────────────────────────────────────────────────────────
// [2] FETCH
// ────────────────────────────────────────────────────────────────────────────

function wkpiFetch(rpc) {
  var hids = CFG_WKPI.wanHosts.map(function(h) { return h.hostid })
  return Promise.all([
    rpc('item.get', {
      hostids: hids,
      search:  { key_: 'icmpping' },
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
      groupids:  ['27'],
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

function wkpiTile(opts) {
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

function wkpiRender(el, data) {
  var hids    = CFG_WKPI.wanHosts.map(function(h) { return h.hostid })
  var total   = hids.length

  // ICMP por host
  var icmpUp = {}
  data.icmp.forEach(function(i) { icmpUp[i.hostid] = i.lastvalue === '1' })

  // Circuitos down por host (interfaces nomeadas com parênteses)
  var ifDownByHost = {}
  var totalIfs = 0
  data.ifaces.forEach(function(i) {
    if (!WKPI_NAMED_IF.test(i.name || '')) return
    totalIfs++
    if (i.lastvalue === '2') {
      ifDownByHost[i.hostid] = (ifDownByHost[i.hostid] || 0) + 1
    }
  })

  var up   = hids.filter(function(id) { return icmpUp[id] && !ifDownByHost[id] }).length
  var degr = hids.filter(function(id) { return icmpUp[id] &&  ifDownByHost[id] }).length
  var down = hids.filter(function(id) { return !icmpUp[id] }).length
  var bad  = degr + down

  // Alertas
  var crit = 0, warn = 0
  data.trigs.forEach(function(t) {
    var p = parseInt(t.priority, 10)
    if (CFG_WKPI.trigPriority.crit.indexOf(p) !== -1) crit++
    else if (CFG_WKPI.trigPriority.warn.indexOf(p) !== -1) warn++
  })

  var routerSt = down > 0 ? 'down' : degr > 0 ? 'warn' : 'ok'
  var upSt     = up < total ? (down > 0 ? 'crit' : 'warn') : 'ok'
  var badSt    = bad > 0 ? (down > 0 ? 'down' : 'warn') : 'ok'
  var alrtSt   = crit > 0 ? 'crit' : warn > 0 ? 'warn' : 'ok'

  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + wkpiTile({
        label: 'Routers WAN', value: total, unit: 'routers',
        state: routerSt,
        sub: '5 serviços monitorizados',
      })
    + wkpiTile({
        label: 'Serviços UP', value: up, unit: '/ ' + total,
        state: upSt,
        valueColor: upSt === 'ok' ? window.BPC.state.color('ok') : '#E6EDF3',
        sub: 'ICMP OK + sem circuitos down',
      })
    + wkpiTile({
        label: 'Degradado / DOWN', value: bad, unit: 'afectados',
        state: badSt,
        valueColor: bad > 0 ? window.BPC.state.color(badSt) : '#E6EDF3',
        sub: down + ' down · ' + degr + ' degradado',
      })
    + wkpiTile({
        label: 'Circuitos', value: totalIfs, unit: 'total',
        state: 'ok',
        sub: 'interfaces nomeadas grupo 27',
      })
    + wkpiTile({
        label: 'Alertas activos', value: crit + warn, unit: 'alertas',
        state: alrtSt,
        valueColor: (crit + warn) > 0 ? window.BPC.state.color(alrtSt) : '#E6EDF3',
        sub: crit + ' crítico · ' + warn + ' aviso',
      })
    + '</div>'
}

function wkpiRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">'
    + '<div class="bpc-error-msg">⚠ KPI WAN: ' + window.BPC_SHARED.esc(msg) + '</div></div>'
}


// ────────────────────────────────────────────────────────────────────────────
// [4] BOOT
// ────────────────────────────────────────────────────────────────────────────

function wkpiLoad(rpc) {
  var el = document.getElementById(CFG_WKPI.elementId)
  if (!el) return
  el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;height:100%">'
    + [0,1,2,3,4].map(function() { return '<div>' + window.BPC.utils.buildSkeleton() + '</div>' }).join('')
    + '</div>'
  wkpiFetch(rpc)
    .then(function(data) { wkpiRender(el, data) })
    .catch(function(err)  { wkpiRenderError(el, err.message || String(err)) })
  window.BPC.utils.startRefresh(el, function() { wkpiLoad(rpc) }, CFG_WKPI.refreshMs)
}

function wkpiInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') { window.waitForBPC(wkpiLoad); return }
  if (attempt > 50) { console.error('[BPC] l3-wan-kpi: waitForBPC nunca disponivel'); return }
  setTimeout(function() { wkpiInitWithRetry(attempt + 1) }, 100)
}

wkpiInitWithRetry()
