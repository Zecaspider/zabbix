// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  N3 · Rede · Edifícios — Tabela + Estado NOC             v2.0          ║
// ║                                                                          ║
// ║  Routers: ICMP · RTT · Perda · CPU · Uptime → drill N4-Edifício        ║
// ║  Switches: por andar (Sede) com filtro                                   ║
// ╚══════════════════════════════════════════════════════════════════════════╝

const CFG_N3ED = {
  elementId: 'bpc-n3ed-table',
  refreshMs:  60000,
  grupos: { rt: '28', sw: '29' },
  n4Uid: 'n4-edificio-detalhe',
  thresholds: {
    lossPct: { warn: 1,  crit: 5  },
    rttMs:   { warn: 5,  crit: 50 },
    cpuPct:  { warn: 60, crit: 85 },
  },
}

var _n3edTab      = 'rt'
var _n3edSwFilter = 'all'
var _n3edRtRows   = []
var _n3edSwRows   = []


// ── helpers ──────────────────────────────────────────────────────────────────

function n3edEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function n3edFmtUptime(secs) {
  secs = parseInt(secs, 10)
  if (!secs || isNaN(secs)) return '—'
  var d = Math.floor(secs / 86400)
  var h = Math.floor((secs % 86400) / 3600)
  return d > 0 ? d + 'd ' + h + 'h' : h + 'h'
}

function n3edStatusDot(up, lossPct, rttMs) {
  var T = window.BPC.THEME
  if (up === false || up === null) return '<span style="color:' + T.colorCrit + '">●</span> Down'
  var T2 = CFG_N3ED.thresholds
  if (lossPct > T2.lossPct.crit || rttMs > T2.rttMs.crit) return '<span style="color:' + T.colorCrit + '">●</span> Crítico'
  if (lossPct > T2.lossPct.warn || rttMs > T2.rttMs.warn) return '<span style="color:' + T.colorWarn + '">●</span> Degradado'
  return '<span style="color:' + T.colorOk + '">●</span> OK'
}

function n3edStateCls(val, warn, crit) {
  var n = parseFloat(val)
  if (isNaN(n)) return 'bpc-mute'
  return n >= crit ? 'bpc-crit' : n >= warn ? 'bpc-warn' : 'bpc-ok'
}

function n3edSortRows(rows) {
  return rows.slice().sort(function (a, b) {
    var order = function (r) {
      if (r.up === false || r.up === null) return 0
      if (r.lossPct > CFG_N3ED.thresholds.lossPct.warn || r.rttMs > CFG_N3ED.thresholds.rttMs.warn) return 1
      return 2
    }
    var sa = order(a), sb = order(b)
    if (sa !== sb) return sa - sb
    return (a.label || a.andar || '').localeCompare(b.label || b.andar || '')
  })
}

function n3edDrillUrl(hostname) {
  return '/d/' + CFG_N3ED.n4Uid +
    '?var-group=HG_EDIFICIOS_ROUTERS&var-host=' + encodeURIComponent(hostname)
}


// ── fetch ─────────────────────────────────────────────────────────────────────

async function n3edFetchGroup(rpc, groupId, withCpu) {
  var hosts = await rpc('host.get', {
    groupids:   [groupId],
    output:     ['hostid', 'name'],
    selectTags: ['tag', 'value'],
  })
  if (!hosts.length) return []

  var hostIds = hosts.map(function (h) { return h.hostid })

  var queries = [
    rpc('item.get', {
      hostids: hostIds, search: { key_: 'icmpping' }, filter: { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'],
    }),
    rpc('item.get', {
      hostids: hostIds, filter: { key_: 'system.uptime', status: 0 },
      output:  ['hostid', 'lastvalue'],
    }),
  ]
  if (withCpu) {
    queries.push(rpc('item.get', {
      hostids: hostIds, search: { key_: 'system.cpu.util' }, filter: { status: 0 },
      output:  ['hostid', 'key_', 'lastvalue'], limit: hostIds.length,
    }))
  }

  var results = await Promise.all(queries)
  var icmpItems = results[0], uptItems = results[1], cpuItems = results[2]

  var icmp   = {}, uptMap = {}, cpuMap = {}

  icmpItems.forEach(function (i) {
    if (!icmp[i.hostid]) icmp[i.hostid] = { up: null, rtt: 0, loss: 0 }
    var h = icmp[i.hostid]
    if (i.key_ === 'icmpping')     h.up   = i.lastvalue === '1'
    if (i.key_ === 'icmppingsec')  h.rtt  = parseFloat(i.lastvalue) * 1000
    if (i.key_ === 'icmppingloss') h.loss = parseFloat(i.lastvalue)
  })
  uptItems.forEach(function (i) { uptMap[i.hostid] = i.lastvalue })
  if (cpuItems) cpuItems.forEach(function (i) {
    if (!cpuMap[i.hostid]) cpuMap[i.hostid] = parseFloat(i.lastvalue)
  })

  return hosts.map(function (h) {
    var tagMap = {}
    ;(h.tags || []).forEach(function (t) { tagMap[t.tag] = t.value })
    var ic = icmp[h.hostid] || { up: null, rtt: 0, loss: 0 }
    return {
      hostid:   h.hostid,
      name:     h.name,
      label:    tagMap['unidade_negocio'] || tagMap['edificio'] || h.name,
      edificio: tagMap['edificio'] || '—',
      andar:    tagMap['andar'] || '—',
      zona:     tagMap['zona'] || '',
      up:       ic.up,
      rttMs:    ic.rtt,
      lossPct:  ic.loss,
      cpuPct:   cpuMap[h.hostid] != null ? cpuMap[h.hostid] : null,
      uptime:   uptMap[h.hostid] || null,
    }
  })
}


// ── render ────────────────────────────────────────────────────────────────────

function n3edBuildRtRows(rows) {
  var T = CFG_N3ED.thresholds
  return rows.map(function (r) {
    var lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    var rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1)   + ' ms' : '—'
    var lossCls = n3edStateCls(r.lossPct, T.lossPct.warn, T.lossPct.crit)
    var rttCls  = n3edStateCls(r.rttMs,   T.rttMs.warn,   T.rttMs.crit)
    var cpuCls  = n3edStateCls(r.cpuPct,  T.cpuPct.warn,  T.cpuPct.crit)
    var drillUrl = n3edDrillUrl(r.name)

    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04);cursor:pointer" onclick="location.href=\'' + drillUrl + '\'">' +
      '<td style="padding:6px 10px;font-weight:700;color:#E6EDF3;font-size:.97rem">' +
        '<a href="' + n3edEsc(drillUrl) + '" style="color:#E6EDF3;text-decoration:none" onclick="event.stopPropagation()">' +
          n3edEsc(r.label) +
        '</a>' +
      '</td>' +
      '<td style="padding:6px 10px;color:#64748B;font-size:.82rem;font-family:monospace">' + n3edEsc(r.name) + '</td>' +
      '<td style="padding:6px 10px;font-size:.93rem">' + n3edStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.97rem" class="' + rttCls  + '">' + n3edEsc(rttStr)  + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.97rem" class="' + lossCls + '">' + n3edEsc(lossStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.97rem" class="' + cpuCls  + '">' + (r.cpuPct != null ? r.cpuPct.toFixed(0) + '%' : '<span class="bpc-mute">—</span>') + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.87rem;color:var(--bpc-mute)">' + n3edEsc(n3edFmtUptime(r.uptime)) + '</td>' +
      '<td style="padding:6px 10px;text-align:center">' +
        '<a href="' + n3edEsc(drillUrl) + '" style="font-size:.72rem;color:var(--bpc-cyan);white-space:nowrap" onclick="event.stopPropagation()">N4 →</a>' +
      '</td>' +
      '</tr>'
  }).join('')
}

function n3edBuildSwRows(rows) {
  var T = CFG_N3ED.thresholds
  return rows.map(function (r) {
    var lossStr = r.lossPct != null ? r.lossPct.toFixed(1) + '%' : '—'
    var rttStr  = r.rttMs   != null ? r.rttMs.toFixed(1)   + ' ms' : '—'
    var lossCls = n3edStateCls(r.lossPct, T.lossPct.warn, T.lossPct.crit)
    var rttCls  = n3edStateCls(r.rttMs,   T.rttMs.warn,   T.rttMs.crit)
    var displayAndar = r.andar !== '—' ? r.andar : '—'
    var displayZona  = r.zona || ''

    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.04)">' +
      '<td style="padding:6px 10px;font-weight:600;color:#a0b0c8;font-size:.97rem">' + n3edEsc(displayAndar) + '</td>' +
      '<td style="padding:6px 10px;color:#64748B;font-size:.82rem">' + n3edEsc(displayZona) + '</td>' +
      '<td style="padding:6px 10px;color:#E6EDF3;font-size:.87rem;font-family:monospace">' + n3edEsc(r.name) + '</td>' +
      '<td style="padding:6px 10px;font-size:.93rem">' + n3edStatusDot(r.up, r.lossPct, r.rttMs) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.97rem" class="' + rttCls  + '">' + n3edEsc(rttStr)  + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.97rem" class="' + lossCls + '">' + n3edEsc(lossStr) + '</td>' +
      '<td style="padding:6px 10px;text-align:right;font-size:.87rem;color:var(--bpc-mute)">' + n3edEsc(n3edFmtUptime(r.uptime)) + '</td>' +
      '</tr>'
  }).join('')
}

function n3edBuildSwFilterBar(rows) {
  var andares = []
  rows.forEach(function (r) {
    if (r.andar !== '—' && andares.indexOf(r.andar) === -1) andares.push(r.andar)
  })
  andares.sort()

  var btnBase = 'padding:3px 12px;border-radius:12px;border:1px solid;cursor:pointer;font-size:.87rem;transition:all .15s'
  var btn = function (val, label, count) {
    var active = _n3edSwFilter === val
    return '<button class="n3ed-sw-btn" data-val="' + n3edEsc(val) + '" style="' + btnBase +
      ';background:' + (active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.04)') +
      ';color:'      + (active ? '#E6EDF3' : 'var(--bpc-mute)') +
      ';border-color:' + (active ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)') + '">' +
      n3edEsc(label) + ' <span style="opacity:.6">' + count + '</span></button>'
  }

  return '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">' +
    btn('all', 'Todos', rows.length) + ' ' +
    andares.map(function (a) {
      return btn(a, a, rows.filter(function (r) { return r.andar === a }).length)
    }).join(' ') +
    '</div>'
}

function n3edRenderContent(el) {
  var tabBtnBase = 'padding:8px 20px;border:none;border-bottom:2px solid;cursor:pointer;font-size:.97rem;font-weight:600;background:transparent;transition:all .15s'

  var tabRtStyle = tabBtnBase + ';color:' + (_n3edTab === 'rt' ? '#E6EDF3' : 'var(--bpc-mute)') +
    ';border-color:' + (_n3edTab === 'rt' ? 'var(--bpc-info)' : 'transparent')
  var tabSwStyle = tabBtnBase + ';color:' + (_n3edTab === 'sw' ? '#E6EDF3' : 'var(--bpc-mute)') +
    ';border-color:' + (_n3edTab === 'sw' ? 'var(--bpc-info)' : 'transparent')

  var bodyHtml = ''

  if (_n3edTab === 'rt') {
    var sorted = n3edSortRows(_n3edRtRows)
    var down   = sorted.filter(function (r) { return r.up === false || r.up === null }).length
    var downBadge = down > 0 ? ' · <span class="bpc-crit">' + down + ' down</span>' : ''
    bodyHtml = '<div style="margin-bottom:8px;font-size:.87rem;color:var(--bpc-mute)">' + sorted.length + ' routers' + downBadge + '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="font-size:.78rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">' +
          '<th style="padding:5px 10px;text-align:left">Edifício</th>' +
          '<th style="padding:5px 10px;text-align:left">Host</th>' +
          '<th style="padding:5px 10px;text-align:left">Estado</th>' +
          '<th style="padding:5px 10px;text-align:right">RTT</th>' +
          '<th style="padding:5px 10px;text-align:right">Perda</th>' +
          '<th style="padding:5px 10px;text-align:right">CPU</th>' +
          '<th style="padding:5px 10px;text-align:right">Uptime</th>' +
          '<th style="padding:5px 10px;text-align:center"></th>' +
        '</tr></thead>' +
        '<tbody>' + n3edBuildRtRows(sorted) + '</tbody>' +
      '</table>'
  } else {
    var filtered = _n3edSwFilter === 'all'
      ? _n3edSwRows
      : _n3edSwRows.filter(function (r) { return r.andar === _n3edSwFilter })
    var sortedSw = n3edSortRows(filtered)
    var downSw   = sortedSw.filter(function (r) { return r.up === false || r.up === null }).length
    var downSwBadge = downSw > 0 ? ' · <span class="bpc-crit">' + downSw + ' down</span>' : ''
    bodyHtml = n3edBuildSwFilterBar(_n3edSwRows) +
      '<div style="margin-bottom:8px;font-size:.87rem;color:var(--bpc-mute)">' + sortedSw.length + ' switches (Sede BPC)' + downSwBadge + '</div>' +
      '<table style="width:100%;border-collapse:collapse">' +
        '<thead><tr style="font-size:.78rem;color:var(--bpc-mute);text-transform:uppercase;border-bottom:1px solid rgba(255,255,255,0.08)">' +
          '<th style="padding:5px 10px;text-align:left">Andar</th>' +
          '<th style="padding:5px 10px;text-align:left">Zona</th>' +
          '<th style="padding:5px 10px;text-align:left">Host</th>' +
          '<th style="padding:5px 10px;text-align:left">Estado</th>' +
          '<th style="padding:5px 10px;text-align:right">RTT</th>' +
          '<th style="padding:5px 10px;text-align:right">Perda</th>' +
          '<th style="padding:5px 10px;text-align:right">Uptime</th>' +
        '</tr></thead>' +
        '<tbody>' + n3edBuildSwRows(sortedSw) + '</tbody>' +
      '</table>'
  }

  el.innerHTML =
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">' +
      // Tabs
      '<div style="display:flex;border-bottom:1px solid rgba(255,255,255,0.08);margin-bottom:16px">' +
        '<button class="n3ed-tab" data-tab="rt" style="' + tabRtStyle + '">Routers <span style="opacity:.6;font-size:.82rem">' + _n3edRtRows.length + '</span></button>' +
        '<button class="n3ed-tab" data-tab="sw" style="' + tabSwStyle + '">Switches <span style="opacity:.6;font-size:.82rem">' + _n3edSwRows.length + '</span></button>' +
      '</div>' +
      // Body
      '<div class="bpc bpc-card" style="padding:14px 16px">' + bodyHtml + '</div>' +
    '</div>'

  el.querySelectorAll('.n3ed-tab').forEach(function (btn) {
    btn.addEventListener('click', function () { _n3edTab = btn.dataset.tab; n3edRenderContent(el) })
  })
  el.querySelectorAll('.n3ed-sw-btn').forEach(function (btn) {
    btn.addEventListener('click', function () { _n3edSwFilter = btn.dataset.val; n3edRenderContent(el) })
  })
}

function n3edRenderError(el, msg) {
  el.innerHTML = '<div class="bpc bpc-card state-down" style="--card-accent:var(--bpc-crit)">' +
    '<div class="bpc-error-msg">⚠ Edifícios N3: ' + n3edEsc(msg) + '</div></div>'
}


// ── bootstrap ─────────────────────────────────────────────────────────────────

function n3edLoad(rpc) {
  var el = document.getElementById(CFG_N3ED.elementId)
  if (!el) return
  el.innerHTML = window.BPC.utils.buildSkeleton()

  Promise.all([
    n3edFetchGroup(rpc, CFG_N3ED.grupos.rt, true),
    n3edFetchGroup(rpc, CFG_N3ED.grupos.sw, false),
  ])
  .then(function (results) {
    _n3edRtRows = results[0]
    _n3edSwRows = results[1]
    n3edRenderContent(el)
  })
  .catch(function (err) { n3edRenderError(el, err.message || String(err)) })

  BPC.utils.startRefresh(el, function () { n3edLoad(rpc) }, CFG_N3ED.refreshMs)
}

function n3edInitWithRetry(attempt) {
  attempt = attempt || 0
  if (typeof window.waitForBPC === 'function') {
    window.waitForBPC(n3edLoad)
    return
  }
  if (attempt > 50) {
    console.error('[BPC] l3-edificios-table: window.waitForBPC nunca ficou disponivel')
    return
  }
  setTimeout(function () { n3edInitWithRetry(attempt + 1) }, 100)
}

n3edInitWithRetry()
