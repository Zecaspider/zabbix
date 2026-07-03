// N3 · Rede · Edifícios — Cards 3×3
// l3-edificios-table.js  v4.0
// 9 routers de edifício → grid de cards; ordem: DOWN → Crítico → Degradado → OK.
// Drill → N4 Edifício via URL var-host=<hostname>.
// 6 sinais por card, 2 linhas de 3:
//   linha 1 (severidade) — Links WAN, Perda, RTT
//   linha 2 (contexto)   — Alertas activos, Erros/Descartes, Uptime

const CFG_N3ED = {
  elementId: 'bpc-n3ed-table',
  refreshMs:  60000,
  groupId:   '28',
  n4Uid:     'rede-n4-edificio',
  wanIfaceRe: /Interface.*\((?:[^)]*(?:WAN|DMVPN|TUNEL|TUNNEL)[^)]*)\)/i,
  thresholds: {
    // Perda ICMP: canónico engenharia-do-sistema.md §6.2 ("rede, agências") — não inventar aqui.
    lossPct:  { warn: 1,  crit: 10 },
    rttMs:    { warn: 5,  crit: 50 },
    alerts:   { warn: 1,  crit: 3  },  // só colore o número "Alertas" do card, não decide o estado (ver n3edStatus)
    discards: { warn: 1,  crit: 10 },
  },
}


// ── helpers ───────────────────────────────────────────────────────────────────

function n3edEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function n3edFmtUptime(secs) {
  if (secs == null || isNaN(secs)) return { val: '—', unit: '' }
  var d = Math.floor(secs / 86400)
  if (d > 0) return { val: String(d), unit: 'd' }
  var h = Math.floor(secs / 3600)
  return { val: String(h), unit: 'h' }
}

function n3edStatus(r) {
  if (r.up === false || r.up === null) return 'down'
  var T = CFG_N3ED.thresholds
  // Estado por severidade de trigger (fonte de verdade Zabbix, engenharia-do-sistema.md §6.2
  // "Severidade trigger → estado") — nunca por contagem bruta de alertas.
  var alertState = window.BPC_SHARED.severityToState(r.alertSeverity)
  if (r.wanTotal > 0 && r.wanUp < r.wanTotal * 0.5) return 'crit'
  if (r.lossPct > T.lossPct.crit || r.rttMs > T.rttMs.crit) return 'crit'
  if (alertState === 'crit') return 'crit'
  if (r.wanTotal > 0 && r.wanUp < r.wanTotal) return 'warn'
  if (r.lossPct > T.lossPct.warn || r.rttMs > T.rttMs.warn) return 'warn'
  if (alertState === 'warn') return 'warn'
  if (r.discards >= T.discards.warn) return 'warn'
  return 'ok'
}

function n3edSortRows(rows) {
  var order = { down: 0, crit: 1, warn: 2, ok: 3 }
  return rows.slice().sort(function (a, b) {
    var sa = order[n3edStatus(a)]
    var sb = order[n3edStatus(b)]
    if (sa !== sb) return sa - sb
    return (a.label || '').localeCompare(b.label || '')
  })
}

function n3edDrillUrl(hostname) {
  return '/d/' + CFG_N3ED.n4Uid + '?var-group=HG_EDIFICIOS_ROUTERS&var-host=' + encodeURIComponent(hostname)
}

function n3edValColor(val, warn, crit) {
  var n = parseFloat(val)
  if (isNaN(n)) return '#64748B'
  if (n >= crit) return '#F85149'
  if (n >= warn) return '#D29922'
  return '#22C55E'
}

function n3edWanColor(up, total) {
  if (total === 0) return '#64748B'
  if (up < total * 0.5) return '#F85149'
  if (up < total) return '#D29922'
  return '#22C55E'
}


// ── fetch ─────────────────────────────────────────────────────────────────────

function n3edFetch(rpc) {
  return rpc('host.get', {
    groupids:   [CFG_N3ED.groupId],
    output:     ['hostid', 'name'],
    selectTags: ['tag', 'value'],
  }).then(function (hosts) {
    if (!hosts.length) return []
    var ids = hosts.map(function (h) { return h.hostid })

    return Promise.all([
      rpc('item.get', {
        hostids: ids,
        search:  { key_: 'icmpping' },
        filter:  { status: 0 },
        output:  ['hostid', 'key_', 'lastvalue'],
      }),
      rpc('item.get', {
        hostids: ids,
        search:  { key_: 'net.if.status' },
        filter:  { status: 0 },
        output:  ['hostid', 'name', 'lastvalue'],
      }),
      rpc('item.get', {
        hostids: ids,
        search:  { key_: 'net.if.in.discards' },
        filter:  { status: 0 },
        output:  ['hostid', 'name', 'lastvalue'],
      }),
      rpc('trigger.get', {
        hostids:   ids,
        filter:    { value: 1 },
        monitored: true,
        output:    ['triggerid', 'priority'],
        selectHosts: ['hostid'],
      }),
      rpc('item.get', {
        hostids: ids,
        search:  { key_: 'system.net.uptime' },
        filter:  { status: 0 },
        output:  ['hostid', 'lastvalue'],
        limit:   hosts.length,
      }),
    ]).then(function (r) {
      var icmpItems = r[0], ifStatusItems = r[1], discardItems = r[2], triggers = r[3], uptimeItems = r[4]
      var wanRe = CFG_N3ED.wanIfaceRe

      var icmpMap = {}, rttMap = {}, lossMap = {}
      icmpItems.forEach(function (i) {
        if (i.key_ === 'icmpping')     icmpMap[i.hostid] = i.lastvalue === '1'
        if (i.key_ === 'icmppingsec')  rttMap[i.hostid]  = parseFloat(i.lastvalue) * 1000
        if (i.key_ === 'icmppingloss') lossMap[i.hostid] = parseFloat(i.lastvalue)
      })

      var wanUpMap = {}, wanTotalMap = {}
      ifStatusItems.forEach(function (i) {
        if (!wanRe.test(i.name || '')) return
        wanTotalMap[i.hostid] = (wanTotalMap[i.hostid] || 0) + 1
        if (i.lastvalue === '1') wanUpMap[i.hostid] = (wanUpMap[i.hostid] || 0) + 1
      })

      var discardsMap = {}
      discardItems.forEach(function (i) {
        if (!wanRe.test(i.name || '')) return
        var v = parseFloat(i.lastvalue)
        if (isNaN(v)) return
        discardsMap[i.hostid] = (discardsMap[i.hostid] || 0) + v
      })

      var alertsMap = {}, alertSeverityMap = {}
      triggers.forEach(function (t) {
        var sev = parseInt(t.priority, 10) || 0
        ;(t.hosts || []).forEach(function (h) {
          alertsMap[h.hostid] = (alertsMap[h.hostid] || 0) + 1
          alertSeverityMap[h.hostid] = Math.max(alertSeverityMap[h.hostid] || 0, sev)
        })
      })

      var uptimeMap = {}
      uptimeItems.forEach(function (i) { if (uptimeMap[i.hostid] == null) uptimeMap[i.hostid] = parseFloat(i.lastvalue) })

      return hosts.map(function (h) {
        var tags = {}
        ;(h.tags || []).forEach(function (t) { tags[t.tag] = t.value })
        return {
          hostid:   h.hostid,
          name:     h.name,
          label:    tags['unidade_negocio'] || tags['edificio'] || h.name,
          up:       icmpMap[h.hostid] != null ? icmpMap[h.hostid] : null,
          rttMs:    rttMap[h.hostid]  != null ? rttMap[h.hostid]  : null,
          lossPct:  lossMap[h.hostid] != null ? lossMap[h.hostid] : null,
          wanUp:    wanUpMap[h.hostid]    || 0,
          wanTotal: wanTotalMap[h.hostid] || 0,
          discards: discardsMap[h.hostid] != null ? discardsMap[h.hostid] : 0,
          alerts:   alertsMap[h.hostid]   || 0,
          alertSeverity: alertSeverityMap[h.hostid] || 0,
          uptime:   uptimeMap[h.hostid]   != null ? uptimeMap[h.hostid] : null,
        }
      })
    })
  })
}


// ── render ────────────────────────────────────────────────────────────────────

function n3edStat(label, val, unit, color, big) {
  var fs = big ? 24 : 21
  return '<div style="text-align:center">' +
    '<div style="font-size:' + fs + 'px;font-weight:700;font-family:monospace;color:' + color + '">' + val +
      '<span style="font-size:15px;font-weight:600">' + unit + '</span></div>' +
    '<div style="font-size:13px;color:#64748B;text-transform:uppercase;letter-spacing:.03em;margin-top:2px">' + label + '</div>' +
  '</div>'
}

function n3edBuildCard(r) {
  var status   = n3edStatus(r)
  var drillUrl = n3edDrillUrl(r.name)
  var T        = CFG_N3ED.thresholds

  var accentColor = status === 'down' || status === 'crit' ? '#F85149'
                  : status === 'warn' ? '#D29922'
                  : '#22C55E'
  var bgColor = status === 'down' || status === 'crit'
    ? 'rgba(239,68,68,0.06)'
    : status === 'warn'
    ? 'rgba(210,153,34,0.06)'
    : 'rgba(255,255,255,0.03)'

  var pillHtml = status === 'down'
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:3px 11px;font-size:16px;font-weight:600">● Down</span>'
    : status === 'crit'
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:3px 11px;font-size:16px;font-weight:600">● Crítico</span>'
    : status === 'warn'
    ? '<span style="background:rgba(210,153,34,0.15);color:#D29922;border:1px solid rgba(210,153,34,0.35);border-radius:20px;padding:3px 11px;font-size:16px;font-weight:600">● Degradado</span>'
    : '<span style="background:rgba(34,197,94,0.12);color:#22C55E;border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:3px 11px;font-size:16px;font-weight:600">● OK</span>'

  var rttStr  = r.rttMs  != null ? r.rttMs.toFixed(1) : '—'
  var lossStr = r.lossPct != null ? r.lossPct.toFixed(1) : '—'
  var wanStr  = r.wanTotal > 0 ? r.wanUp + '/' + r.wanTotal : '—'
  var alertStr = String(r.alerts)
  var discStr  = r.discards.toFixed(r.discards < 10 ? 1 : 0)
  var upt = n3edFmtUptime(r.uptime)
  var uptColor = r.uptime != null && r.uptime < 86400 ? '#D29922' : '#8B949E'

  var row1 =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:5px 0">' +
      n3edStat('Links WAN', wanStr,  '',   n3edWanColor(r.wanUp, r.wanTotal), true) +
      n3edStat('Perda',     lossStr, '%',  n3edValColor(r.lossPct, T.lossPct.warn, T.lossPct.crit), true) +
      n3edStat('RTT',       rttStr,  ' ms',n3edValColor(r.rttMs,   T.rttMs.warn,   T.rttMs.crit), true) +
    '</div>'

  var row2 =
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:5px 0">' +
      n3edStat('Alertas',   alertStr, '',  n3edValColor(r.alerts, T.alerts.warn, T.alerts.crit), false) +
      n3edStat('Descartes', discStr,  '',  n3edValColor(r.discards, T.discards.warn, T.discards.crit), false) +
      n3edStat('Uptime',    upt.val,  upt.unit, uptColor, false) +
    '</div>'

  return '<a href="' + n3edEsc(drillUrl) + '" title="' + n3edEsc(r.name) + ' — Ver detalhe (N4)" style="text-decoration:none;display:block">' +
    '<div style="background:' + bgColor + ';border:1px solid rgba(255,255,255,0.08);border-left:4px solid ' + accentColor + ';border-radius:6px;padding:10px 16px 8px;cursor:pointer;transition:background .15s" ' +
      'onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" ' +
      'onmouseout="this.style.background=\'' + bgColor + '\'">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<span style="font-size:20px;font-weight:700;color:#E6EDF3;line-height:1.3">' + n3edEsc(r.label) + '</span>' +
        '<div style="display:flex;align-items:center;gap:6px">' + pillHtml + '<span style="color:#58A6FF;font-size:16px;font-weight:700">→</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.06);margin-top:4px">' +
        row1 +
        '<div style="border-top:1px solid rgba(255,255,255,0.05)"></div>' +
        row2 +
      '</div>' +
    '</div>' +
  '</a>'
}

function n3edRenderCards(el, rows) {
  var sorted = n3edSortRows(rows)
  var nDown  = sorted.filter(function (r) { return r.up === false || r.up === null }).length
  var nWarn  = sorted.filter(function (r) { var s = n3edStatus(r); return s === 'warn' || s === 'crit' }).length

  var badgeHtml = nDown > 0
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:2px 10px;font-size:16px;font-weight:600">' + nDown + ' down</span> '
    : ''
  badgeHtml += nWarn > 0
    ? '<span style="background:rgba(210,153,34,0.15);color:#D29922;border:1px solid rgba(210,153,34,0.35);border-radius:20px;padding:2px 10px;font-size:16px;font-weight:600">' + nWarn + ' degradado</span>'
    : ''
  if (!badgeHtml) {
    badgeHtml = '<span style="background:rgba(34,197,94,0.12);color:#22C55E;border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:2px 10px;font-size:16px;font-weight:600">Todos OK</span>'
  }

  el.innerHTML =
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<span style="font-size:16px;color:#64748B">' + sorted.length + ' edifícios</span>' +
        '<div style="display:flex;gap:6px">' + badgeHtml + '</div>' +
      '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">' +
        sorted.map(n3edBuildCard).join('') +
      '</div>' +
    '</div>'
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

  n3edFetch(rpc)
    .then(function (rows) { n3edRenderCards(el, rows) })
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
