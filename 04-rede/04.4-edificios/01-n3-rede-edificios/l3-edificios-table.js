// N3 · Rede · Edifícios — Cards 3×3
// l3-edificios-table.js  v3.0
// 9 routers de edifício → grid de cards; ordem: DOWN → Degradado → OK.
// Drill → N4 Edifício via URL var-host=<hostname>.

const CFG_N3ED = {
  elementId: 'bpc-n3ed-table',
  refreshMs:  60000,
  groupId:   '28',
  n4Uid:     'rede-n4-edificio',
  thresholds: {
    lossPct: { warn: 1,  crit: 5  },
    rttMs:   { warn: 5,  crit: 50 },
    cpuPct:  { warn: 60, crit: 85 },
  },
}


// ── helpers ───────────────────────────────────────────────────────────────────

function n3edEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  })
}

function n3edStatus(up, lossPct, rttMs) {
  if (up === false || up === null) return 'down'
  var T = CFG_N3ED.thresholds
  if (lossPct > T.lossPct.crit || rttMs > T.rttMs.crit) return 'crit'
  if (lossPct > T.lossPct.warn || rttMs > T.rttMs.warn) return 'warn'
  return 'ok'
}

function n3edSortRows(rows) {
  var order = { down: 0, crit: 1, warn: 2, ok: 3 }
  return rows.slice().sort(function (a, b) {
    var sa = order[n3edStatus(a.up, a.lossPct, a.rttMs)]
    var sb = order[n3edStatus(b.up, b.lossPct, b.rttMs)]
    if (sa !== sb) return sa - sb
    return (a.label || '').localeCompare(b.label || '')
  })
}

function n3edDrillUrl(hostname) {
  return '/d/' + CFG_N3ED.n4Uid + '?var-group=HG_EDIFICIOS_ROUTERS&var-host=' + encodeURIComponent(hostname)
}

function n3edValColor(val, warn, crit, inverse) {
  var n = parseFloat(val)
  if (isNaN(n)) return '#64748B'
  if (inverse) {
    if (n <= warn) return '#22C55E'
    if (n <= crit) return '#D29922'
    return '#F85149'
  }
  if (n >= crit) return '#F85149'
  if (n >= warn) return '#D29922'
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
        search:  { key_: 'system.cpu.util' },
        filter:  { status: 0 },
        output:  ['hostid', 'lastvalue'],
        limit:   hosts.length,
      }),
    ]).then(function (r) {
      var icmpItems = r[0], cpuItems = r[1]

      var icmpMap = {}, rttMap = {}, lossMap = {}, cpuMap = {}
      icmpItems.forEach(function (i) {
        if (i.key_ === 'icmpping')     icmpMap[i.hostid] = i.lastvalue === '1'
        if (i.key_ === 'icmppingsec')  rttMap[i.hostid]  = parseFloat(i.lastvalue) * 1000
        if (i.key_ === 'icmppingloss') lossMap[i.hostid] = parseFloat(i.lastvalue)
      })
      cpuItems.forEach(function (i) { if (!cpuMap[i.hostid]) cpuMap[i.hostid] = parseFloat(i.lastvalue) })

      return hosts.map(function (h) {
        var tags = {}
        ;(h.tags || []).forEach(function (t) { tags[t.tag] = t.value })
        return {
          hostid:   h.hostid,
          name:     h.name,
          label:    tags['unidade_negocio'] || tags['edificio'] || h.name,
          modelo:   tags['modelo'] || '',
          up:       icmpMap[h.hostid] != null ? icmpMap[h.hostid] : null,
          rttMs:    rttMap[h.hostid]  != null ? rttMap[h.hostid]  : null,
          lossPct:  lossMap[h.hostid] != null ? lossMap[h.hostid] : null,
          cpuPct:   cpuMap[h.hostid]  != null ? cpuMap[h.hostid]  : null,
        }
      })
    })
  })
}


// ── render ────────────────────────────────────────────────────────────────────

function n3edBuildCard(r) {
  var status   = n3edStatus(r.up, r.lossPct, r.rttMs)
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
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600">● Down</span>'
    : status === 'crit'
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600">● Crítico</span>'
    : status === 'warn'
    ? '<span style="background:rgba(210,153,34,0.15);color:#D29922;border:1px solid rgba(210,153,34,0.35);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600">● Degradado</span>'
    : '<span style="background:rgba(34,197,94,0.12);color:#22C55E;border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:3px 11px;font-size:12px;font-weight:600">● OK</span>'

  var rttStr  = r.rttMs  != null ? r.rttMs.toFixed(1) : '—'
  var lossStr = r.lossPct != null ? r.lossPct.toFixed(1) : '—'
  var cpuStr  = r.cpuPct  != null ? r.cpuPct.toFixed(0) : '—'

  function stat(label, val, unit, color) {
    return '<div style="text-align:center">' +
      '<div style="font-size:21px;font-weight:700;font-family:monospace;color:' + color + '">' + n3edEsc(val) +
        '<span style="font-size:12px;font-weight:600">' + unit + '</span></div>' +
      '<div style="font-size:10px;color:#64748B;text-transform:uppercase;letter-spacing:.04em;margin-top:2px">' + label + '</div>' +
    '</div>'
  }

  return '<a href="' + n3edEsc(drillUrl) + '" style="text-decoration:none;display:block">' +
    '<div style="background:' + bgColor + ';border:1px solid rgba(255,255,255,0.08);border-left:4px solid ' + accentColor + ';border-radius:6px;padding:16px 18px 14px;cursor:pointer;transition:background .15s" ' +
      'onmouseover="this.style.background=\'rgba(255,255,255,0.06)\'" ' +
      'onmouseout="this.style.background=\'' + bgColor + '\'">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2px">' +
        '<span style="font-size:16px;font-weight:700;color:#E6EDF3;line-height:1.3">' + n3edEsc(r.label) + '</span>' +
        pillHtml +
      '</div>' +
      '<div style="font-size:11px;color:#4A5568;font-family:monospace;margin-bottom:14px">' + n3edEsc(r.name) + '</div>' +
      '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.06);border-bottom:1px solid rgba(255,255,255,0.06)">' +
        stat('RTT',   rttStr,  ' ms', n3edValColor(r.rttMs,   T.rttMs.warn,   T.rttMs.crit,   false)) +
        stat('Perda', lossStr, '%',   n3edValColor(r.lossPct, T.lossPct.warn, T.lossPct.crit, false)) +
        stat('CPU',   cpuStr,  '%',   n3edValColor(r.cpuPct,  T.cpuPct.warn,  T.cpuPct.crit,  false)) +
      '</div>' +
      '<div style="margin-top:10px;text-align:right;font-size:12px;font-weight:600;color:#58A6FF">Ver detalhe (N4) →</div>' +
    '</div>' +
  '</a>'
}

function n3edRenderCards(el, rows) {
  var sorted = n3edSortRows(rows)
  var nDown  = sorted.filter(function (r) { return r.up === false || r.up === null }).length
  var nWarn  = sorted.filter(function (r) { var s = n3edStatus(r.up, r.lossPct, r.rttMs); return s === 'warn' || s === 'crit' }).length

  var badgeHtml = nDown > 0
    ? '<span style="background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">' + nDown + ' down</span> '
    : ''
  badgeHtml += nWarn > 0
    ? '<span style="background:rgba(210,153,34,0.15);color:#D29922;border:1px solid rgba(210,153,34,0.35);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">' + nWarn + ' degradado</span>'
    : ''
  if (!badgeHtml) {
    badgeHtml = '<span style="background:rgba(34,197,94,0.12);color:#22C55E;border:1px solid rgba(34,197,94,0.3);border-radius:20px;padding:2px 10px;font-size:12px;font-weight:600">Todos OK</span>'
  }

  el.innerHTML =
    '<div class="bpc" style="font-family:\'Inter\',\'Segoe UI\',sans-serif">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">' +
        '<span style="font-size:12px;color:#64748B">' + sorted.length + ' edifícios</span>' +
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
